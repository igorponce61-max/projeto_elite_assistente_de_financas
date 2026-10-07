from datetime import date, datetime
from decimal import Decimal

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OperationInput(BaseModel):
    nome: str = Field(min_length=1, max_length=160, examples=["Unidade Centro"])
    faturamento: Decimal = Field(ge=0, max_digits=15, decimal_places=2, examples=[100000])
    valor_lucro: Decimal = Field(ge=0, max_digits=15, decimal_places=2, examples=[25000])
    valor_custo: Decimal = Field(ge=0, max_digits=15, decimal_places=2, examples=[75000])
    quantidade_funcionarios: int = Field(ge=0, examples=[12])


class OperationOut(OperationInput):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: datetime


class OperationMetrics(OperationOut):
    percentual_lucro: Decimal = Field(description="Margem de lucro: lucro / faturamento × 100")
    participacao_lucro: Decimal = Field(description="Participação no lucro total × 100")
    participacao_custo: Decimal = Field(description="Participação no custo total × 100")
    participacao_faturamento: Decimal = Field(description="Participação no faturamento total × 100")
    participacao_funcionarios: Decimal = Field(description="Participação no total de funcionários × 100")


class AnalysisOut(BaseModel):
    total_operacoes: int
    totais: dict[str, Decimal | int]
    operacoes: list[OperationMetrics]


class LoanInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    nome_cliente: str = Field(min_length=1, max_length=160)
    data_emprestimo: date
    tipo_prazo: Literal["dias", "parcelas"]
    prazo_valor: int = Field(ge=1, le=600)
    taxa_juros: Decimal = Field(ge=0, le=1000, max_digits=7, decimal_places=2)
    valor_emprestado: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
    multa_diaria: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=15, decimal_places=2)


class LoanOut(LoanInput):
    model_config = ConfigDict(from_attributes=True)

    id: int
    criado_em: datetime
    valor_a_receber: Decimal
    vencimentos: list[date]


class LoanAnalysisOut(BaseModel):
    total_emprestado: Decimal
    total_a_receber: Decimal
    taxa_media: Decimal
    quantidade_clientes: int
    quantidade_emprestimos: int
    emprestimos: list[LoanOut]


class PaymentOut(BaseModel):
    pagamento_id: int
    emprestimo_id: int
    nome_cliente: str
    valor_emprestado: Decimal
    taxa_juros: Decimal
    numero_parcela: int
    total_parcelas: int
    data_vencimento: date
    dias_restantes: int
    valor_a_receber: Decimal
    multa_diaria: Decimal
    multa_acumulada: Decimal
    valor_total: Decimal
    dias_atraso: int
    pago: bool


class PaymentStatusInput(BaseModel):
    pago: bool
