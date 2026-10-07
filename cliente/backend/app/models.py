from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Operation(Base):
    __tablename__ = "operacoes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    faturamento: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    valor_lucro: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    valor_custo: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    quantidade_funcionarios: Mapped[int] = mapped_column(Integer, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Loan(Base):
    __tablename__ = "emprestimos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nome_cliente: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    data_emprestimo: Mapped[date] = mapped_column(Date, nullable=False)
    tipo_prazo: Mapped[str] = mapped_column(String(12), nullable=False)
    prazo_valor: Mapped[int] = mapped_column(Integer, nullable=False)
    taxa_juros: Mapped[Decimal] = mapped_column(Numeric(7, 2), nullable=False)
    valor_emprestado: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    multa_diaria: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, server_default=text("0.00"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class LoanPayment(Base):
    __tablename__ = "pagamentos_emprestimos"
    __table_args__ = (UniqueConstraint("emprestimo_id", "numero_parcela"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    emprestimo_id: Mapped[int] = mapped_column(ForeignKey("emprestimos.id", ondelete="CASCADE"), nullable=False, index=True)
    numero_parcela: Mapped[int] = mapped_column(Integer, nullable=False)
    data_vencimento: Mapped[date] = mapped_column(Date, nullable=False)
    pago: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pago_em: Mapped[date | None] = mapped_column(Date, nullable=True)
