from calendar import monthrange
from contextlib import asynccontextmanager
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from . import models
from .database import Base, engine, get_db
from .schemas import (
    AnalysisOut, LoanAnalysisOut, LoanInput, LoanOut, OperationInput,
    OperationMetrics, OperationOut, PaymentOut, PaymentStatusInput,
)

load_dotenv()
CENT = Decimal("0.01")


def percent(part: Decimal | int, total: Decimal | int) -> Decimal:
    if not total:
        return Decimal("0.00")
    return (Decimal(part) * 100 / Decimal(total)).quantize(CENT, rounding=ROUND_HALF_UP)


def loan_due_dates(loan: models.Loan) -> list[date]:
    if loan.tipo_prazo == "dias":
        return [loan.data_emprestimo + timedelta(days=loan.prazo_valor)]
    dates = []
    for month_offset in range(1, loan.prazo_valor + 1):
        month_index = loan.data_emprestimo.month - 1 + month_offset
        year = loan.data_emprestimo.year + month_index // 12
        month = month_index % 12 + 1
        day = min(loan.data_emprestimo.day, monthrange(year, month)[1])
        dates.append(date(year, month, day))
    return dates


def loan_interest(loan: models.Loan) -> Decimal:
    return (loan.valor_emprestado * loan.taxa_juros / 100).quantize(CENT, rounding=ROUND_HALF_UP)


def installment_interest(loan: models.Loan, installment: int) -> Decimal:
    total_cents = int(loan_interest(loan) * 100)
    total_installments = len(loan_due_dates(loan))
    base_cents, remainder = divmod(total_cents, total_installments)
    return Decimal(base_cents + (1 if installment <= remainder else 0)) / 100


def sync_payment_schedule(db: Session, loan: models.Loan) -> list[models.LoanPayment]:
    existing = db.scalars(
        select(models.LoanPayment).where(models.LoanPayment.emprestimo_id == loan.id)
    ).all()
    by_installment = {payment.numero_parcela: payment for payment in existing}
    due_dates = loan_due_dates(loan)
    for payment in existing:
        if payment.numero_parcela > len(due_dates):
            db.delete(payment)
    result = []
    for installment, due_date in enumerate(due_dates, start=1):
        payment = by_installment.get(installment)
        if payment is None:
            payment = models.LoanPayment(
                emprestimo_id=loan.id,
                numero_parcela=installment,
                data_vencimento=due_date,
                pago=False,
            )
            db.add(payment)
        else:
            payment.data_vencimento = due_date
        result.append(payment)
    db.flush()
    return result


def loan_output(loan: models.Loan) -> LoanOut:
    return LoanOut(
        **LoanInput.model_validate(loan, from_attributes=True).model_dump(),
        id=loan.id,
        criado_em=loan.criado_em,
        valor_a_receber=loan_interest(loan),
        vencimentos=loan_due_dates(loan),
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    loan_columns = {column["name"] for column in inspect(engine).get_columns("emprestimos")}
    if "multa_diaria" not in loan_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE emprestimos ADD COLUMN multa_diaria NUMERIC(15, 2) NOT NULL DEFAULT 0.00"))
    yield


app = FastAPI(
    title=os.getenv("API_TITLE", "Elite Faturamento API"),
    version=os.getenv("API_VERSION", "1.0.0"),
    description=(
        "API para registrar operações e analisar margens e participações. "
        "A documentação interativa Swagger está disponível em /docs."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000,http://localhost:8000",
    ).split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/health", tags=["Sistema"])
def health():
    return {"status": "ok"}


@app.post("/api/v1/operacoes", response_model=OperationOut, status_code=status.HTTP_201_CREATED, tags=["Operações"])
def criar_operacao(payload: OperationInput, db: Session = Depends(get_db)):
    operation = models.Operation(**payload.model_dump())
    db.add(operation)
    db.commit()
    db.refresh(operation)
    return operation


@app.get("/api/v1/operacoes", response_model=list[OperationOut], tags=["Operações"])
def listar_operacoes(db: Session = Depends(get_db)):
    return db.scalars(select(models.Operation).order_by(models.Operation.id)).all()


@app.get("/api/v1/operacoes/{operation_id}", response_model=OperationOut, tags=["Operações"])
def obter_operacao(operation_id: int, db: Session = Depends(get_db)):
    operation = db.get(models.Operation, operation_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Operação não encontrada")
    return operation


@app.put("/api/v1/operacoes/{operation_id}", response_model=OperationOut, tags=["Operações"])
def atualizar_operacao(operation_id: int, payload: OperationInput, db: Session = Depends(get_db)):
    operation = db.get(models.Operation, operation_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Operação não encontrada")
    for field, value in payload.model_dump().items():
        setattr(operation, field, value)
    db.commit()
    db.refresh(operation)
    return operation


@app.delete("/api/v1/operacoes/{operation_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Operações"])
def excluir_operacao(operation_id: int, db: Session = Depends(get_db)):
    operation = db.get(models.Operation, operation_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Operação não encontrada")
    db.delete(operation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/analises/operacoes", response_model=AnalysisOut, tags=["Análises"])
def analisar_operacoes(db: Session = Depends(get_db)):
    operations = db.scalars(select(models.Operation).order_by(models.Operation.id)).all()
    total_lucro = sum((op.valor_lucro for op in operations), Decimal("0"))
    total_custo = sum((op.valor_custo for op in operations), Decimal("0"))
    total_faturamento = sum((op.faturamento for op in operations), Decimal("0"))
    total_funcionarios = sum(op.quantidade_funcionarios for op in operations)

    metrics = [
        OperationMetrics(
            **OperationOut.model_validate(op).model_dump(),
            percentual_lucro=percent(op.valor_lucro, op.faturamento),
            participacao_lucro=percent(op.valor_lucro, total_lucro),
            participacao_custo=percent(op.valor_custo, total_custo),
            participacao_faturamento=percent(op.faturamento, total_faturamento),
            participacao_funcionarios=percent(op.quantidade_funcionarios, total_funcionarios),
        )
        for op in operations
    ]
    return AnalysisOut(
        total_operacoes=len(operations),
        totais={
            "faturamento": total_faturamento,
            "valor_lucro": total_lucro,
            "valor_custo": total_custo,
            "quantidade_funcionarios": total_funcionarios,
        },
        operacoes=metrics,
    )


@app.post("/api/v1/emprestimos", response_model=LoanOut, status_code=status.HTTP_201_CREATED, tags=["Empréstimos"])
def criar_emprestimo(payload: LoanInput, db: Session = Depends(get_db)):
    loan = models.Loan(**payload.model_dump())
    db.add(loan)
    db.flush()
    sync_payment_schedule(db, loan)
    db.commit()
    db.refresh(loan)
    return loan_output(loan)


@app.get("/api/v1/emprestimos", response_model=list[LoanOut], tags=["Empréstimos"])
def listar_emprestimos(db: Session = Depends(get_db)):
    loans = db.scalars(select(models.Loan).order_by(models.Loan.id)).all()
    return [loan_output(loan) for loan in loans]


@app.get("/api/v1/emprestimos/{loan_id}", response_model=LoanOut, tags=["Empréstimos"])
def obter_emprestimo(loan_id: int, db: Session = Depends(get_db)):
    loan = db.get(models.Loan, loan_id)
    if loan is None:
        raise HTTPException(status_code=404, detail="Empréstimo não encontrado")
    return loan_output(loan)


@app.put("/api/v1/emprestimos/{loan_id}", response_model=LoanOut, tags=["Empréstimos"])
def atualizar_emprestimo(loan_id: int, payload: LoanInput, db: Session = Depends(get_db)):
    loan = db.get(models.Loan, loan_id)
    if loan is None:
        raise HTTPException(status_code=404, detail="Empréstimo não encontrado")
    for field, value in payload.model_dump().items():
        setattr(loan, field, value)
    sync_payment_schedule(db, loan)
    db.commit()
    db.refresh(loan)
    return loan_output(loan)


@app.delete("/api/v1/emprestimos/{loan_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Empréstimos"])
def excluir_emprestimo(loan_id: int, db: Session = Depends(get_db)):
    loan = db.get(models.Loan, loan_id)
    if loan is None:
        raise HTTPException(status_code=404, detail="Empréstimo não encontrado")
    db.execute(
        models.LoanPayment.__table__.delete().where(models.LoanPayment.emprestimo_id == loan_id)
    )
    db.delete(loan)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/analises/emprestimos", response_model=LoanAnalysisOut, tags=["Análises"])
def analisar_emprestimos(db: Session = Depends(get_db)):
    loans = db.scalars(select(models.Loan).order_by(models.Loan.id)).all()
    total_principal = sum((loan.valor_emprestado for loan in loans), Decimal("0"))
    total_interest = sum((loan_interest(loan) for loan in loans), Decimal("0"))
    clients = {loan.nome_cliente.strip().casefold() for loan in loans}
    average_rate = (
        sum((loan.taxa_juros for loan in loans), Decimal("0")) / len(loans)
        if loans else Decimal("0")
    ).quantize(CENT, rounding=ROUND_HALF_UP)
    return LoanAnalysisOut(
        total_emprestado=total_principal,
        total_a_receber=total_interest,
        taxa_media=average_rate,
        quantidade_clientes=len(clients),
        quantidade_emprestimos=len(loans),
        emprestimos=[loan_output(loan) for loan in loans],
    )


@app.get("/api/v1/pagamentos", response_model=list[PaymentOut], tags=["Pagamentos"])
def listar_pagamentos(db: Session = Depends(get_db)):
    today = date.today()
    loans = db.scalars(select(models.Loan).order_by(models.Loan.id)).all()
    payments = []
    for loan in loans:
        for payment in sync_payment_schedule(db, loan):
            payments.append(PaymentOut(
            pagamento_id=payment.id,
            emprestimo_id=loan.id,
            nome_cliente=loan.nome_cliente,
            valor_emprestado=loan.valor_emprestado,
            taxa_juros=loan.taxa_juros,
            numero_parcela=payment.numero_parcela,
            total_parcelas=len(loan_due_dates(loan)),
            data_vencimento=payment.data_vencimento,
            dias_restantes=0 if payment.pago else (payment.data_vencimento - today).days,
            dias_atraso=max(0, ((payment.pago_em or today) - payment.data_vencimento).days) if payment.pago or payment.data_vencimento < today else 0,
            valor_a_receber=installment_interest(loan, payment.numero_parcela),
            multa_diaria=loan.multa_diaria,
            multa_acumulada=loan.multa_diaria * max(0, ((payment.pago_em or today) - payment.data_vencimento).days) if payment.pago or payment.data_vencimento < today else Decimal("0.00"),
            valor_total=installment_interest(loan, payment.numero_parcela) + (loan.multa_diaria * max(0, ((payment.pago_em or today) - payment.data_vencimento).days) if payment.pago or payment.data_vencimento < today else Decimal("0.00")),
            pago=payment.pago,
        ))
    db.commit()
    return sorted(payments, key=lambda payment: (payment.data_vencimento, payment.nome_cliente.casefold()))


@app.patch("/api/v1/pagamentos/{payment_id}", response_model=PaymentOut, tags=["Pagamentos"])
def atualizar_status_pagamento(payment_id: int, payload: PaymentStatusInput, db: Session = Depends(get_db)):
    payment = db.get(models.LoanPayment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    payment.pago = payload.pago
    payment.pago_em = date.today() if payload.pago else None
    db.commit()
    return next(item for item in listar_pagamentos(db) if item.pagamento_id == payment_id)
