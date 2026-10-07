const API_BASE = window.ELITE_API_BASE || 'http://127.0.0.1:8000/api/v1';
const API = `${API_BASE}/operacoes`;
const LOANS_API = `${API_BASE}/emprestimos`;
const METRICS = {
  faturamento: { title: 'Faturamento', label: 'FATURAMENTO TOTAL', description: 'Veja quanto cada operação representa do faturamento somado.', key: 'participacao_faturamento', value: 'faturamento', format: money },
  lucro: { title: 'Lucro', label: 'LUCRO TOTAL', description: 'Compare a participação de cada operação no lucro total.', key: 'participacao_lucro', value: 'valor_lucro', format: money },
  custo: { title: 'Custo', label: 'CUSTO TOTAL', description: 'Entenda como os custos se distribuem entre operações.', key: 'participacao_custo', value: 'valor_custo', format: money },
  funcionarios: { title: 'Funcionários', label: 'TOTAL DE FUNCIONÁRIOS', description: 'Confira a participação de cada operação na equipe total.', key: 'participacao_funcionarios', value: 'quantidade_funcionarios', format: number }
};
const COLORS = ['#191919','#ed4c3b','#f28b38','#efcf42','#77776d','#a9aca0','#bb5849','#ddaa48','#55534d','#cbc7b9'];
const state = { operations: [], analysis: null, loans: [], loanAnalysis: null, payments: [], metric: 'faturamento', loanMetric: 'total_a_receber', chartSource: 'operacoes', analysisSource: 'operacoes', busy: false };
let profileName = 'usuario';
let profilePhoto = '';
let draftProfilePhoto = '';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(value || 0)); }
function number(value) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(value || 0)); }
function percent(value) { return `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; }
function parseBrazilianNumber(value) {
  let raw = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!raw) return null;
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => element.classList.remove('show'), 2800); }
function renderAvatar(element, photo, name) {
  element.replaceChildren();
  if (photo) {
    const image = document.createElement('img'); image.src = photo; image.alt = '';
    element.append(image);
  } else element.textContent = (name.trim()[0] || 'U').toLocaleUpperCase('pt-BR');
}
function initProfile() {
  try { profileName = localStorage.getItem('elite-profile-name') || 'usuario'; profilePhoto = localStorage.getItem('elite-profile-photo') || ''; } catch {}
  $('#profile-name').textContent = profileName;
  renderAvatar($('#profile-avatar'), profilePhoto, profileName);
}
function openProfile() {
  draftProfilePhoto = profilePhoto;
  $('#profile-name-input').value = profileName;
  $('#profile-message').textContent = '';
  renderAvatar($('#profile-avatar-preview'), draftProfilePhoto, profileName);
  $('#profile-dialog').showModal();
}
function readProfilePhoto(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 8 * 1024 * 1024) throw new Error('A imagem deve ter até 8 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Esse arquivo não pôde ser usado como imagem.'));
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg).join(' ') : data.detail;
    throw new Error(detail || `Erro ${response.status} ao acessar a API.`);
  }
  return data;
}
async function loadData(showError = true) {
  try {
    const [operations, analysis, loans, loanAnalysis, payments] = await Promise.all([
      request(API), request(`${API_BASE}/analises/operacoes`), request(LOANS_API),
      request(`${API_BASE}/analises/emprestimos`), request(`${API_BASE}/pagamentos`)
    ]);
    state.operations = operations; state.analysis = analysis; state.loans = loans; state.loanAnalysis = loanAnalysis; state.payments = payments;
    $('#connection-label').textContent = 'API conectada';
    $('.top-label i').style.background = '#82a76d';
    render();
  } catch (error) {
    $('#connection-label').textContent = 'API indisponível';
    $('.top-label i').style.background = '#ed4c3b';
    if (showError) toast(`${error.message} Inicie o backend e atualize.`);
  }
}
function renderSummary() {
  const totals = state.analysis?.totais || {};
  const items = [['FATURAMENTO TOTAL', money(totals.faturamento)], ['LUCRO TOTAL', money(totals.valor_lucro)], ['CUSTO TOTAL', money(totals.valor_custo)], ['OPERAÇÕES', number(state.analysis?.total_operacoes)]];
  $('#summary-strip').innerHTML = items.map(([label, value]) => `<div class="summary-item"><div class="summary-label">${label}</div><div class="summary-value">${value}</div></div>`).join('');
}
function renderChart() {
  const isLoans = state.chartSource === 'emprestimos';
  $('#operation-chart-controls').classList.toggle('hidden', isLoans);
  $('#loan-chart-controls').classList.toggle('hidden', !isLoans);
  $$('.source-button[data-chart-source]').forEach(button => button.classList.toggle('selected', button.dataset.chartSource === state.chartSource));
  $$('.metric-button[data-metric]').forEach(button => button.classList.toggle('selected', button.dataset.metric === state.metric));
  $$('.metric-button[data-loan-metric]').forEach(button => button.classList.toggle('selected', button.dataset.loanMetric === state.loanMetric));
  let title, description, label, totalValue, count, pieces;
  if (isLoans) {
    const configs = {
      total_a_receber: { title: 'Total a receber', label: 'JUROS TOTAIS', description: 'Soma dos juros calculados sobre cada valor emprestado.', value: 'valor_a_receber', total: Number(state.loanAnalysis?.total_a_receber || 0), format: money },
      total_emprestado: { title: 'Total emprestado', label: 'VALOR EMPRESTADO', description: 'Principal emprestado, sem incluir os juros.', value: 'valor_emprestado', total: Number(state.loanAnalysis?.total_emprestado || 0), format: money },
      taxa_media: { title: 'Taxa média', label: 'TAXA MÉDIA', description: 'Média simples das taxas de juros cadastradas.', value: 'taxa_juros', total: state.loans.reduce((sum, loan) => sum + Number(loan.taxa_juros || 0), 0), format: percent },
      quantidade_clientes: { title: 'Clientes', label: 'CLIENTES ÚNICOS', description: 'Distribuição dos empréstimos entre os clientes cadastrados.', value: 'cliente', total: Number(state.loanAnalysis?.quantidade_clientes || 0), format: number }
    };
    const metric = configs[state.loanMetric]; title = metric.title; description = metric.description; label = metric.label; totalValue = metric.total; count = state.loanAnalysis?.quantidade_emprestimos || 0;
    if (state.loanMetric === 'quantidade_clientes') {
      const byClient = new Map();
      state.loans.forEach(loan => { const key = loan.nome_cliente.trim().toLocaleLowerCase('pt-BR'); if (!byClient.has(key)) byClient.set(key, { name: loan.nome_cliente, amount: 1 }); });
      pieces = [...byClient.values()].map((client, index) => ({ name: client.name, index, pct: totalValue ? 100 / totalValue : 0 }));
    } else {
      pieces = state.loans.map((loan, index) => ({ name: loan.nome_cliente, index, pct: Number(metric.value === 'taxa_juros' ? loan.taxa_juros : loan[metric.value]) / (metric.total || 1) * 100 })).filter(item => item.pct > 0);
    }
  } else {
    const metric = METRICS[state.metric]; const operations = state.analysis?.operacoes || [];
    title = metric.title; description = metric.description; label = metric.label; totalValue = state.analysis?.totais?.[metric.value] || 0; count = operations.length;
    pieces = operations.map((op, index) => ({ name: op.nome, index, pct: Number(op[metric.key] || 0) })).filter(item => item.pct > 0);
  }
  $('#metric-title').textContent = title; $('#metric-description').textContent = description; $('#pie-label').textContent = label;
  $('#chart-panel-label').textContent = isLoans ? 'PARTICIPAÇÃO POR EMPRÉSTIMO' : 'PARTICIPAÇÃO POR OPERAÇÃO';
  $('#pie-total').textContent = state.chartSource === 'emprestimos' ? (state.loanMetric === 'taxa_media' ? percent(totalValue) : state.loanMetric === 'quantidade_clientes' ? number(totalValue) : money(totalValue)) : (state.metric === 'funcionarios' ? number(totalValue) : money(totalValue));
  $('#chart-count').textContent = String(count).padStart(2, '0');
  $('#chart-count-label').textContent = isLoans ? (state.loanMetric === 'quantidade_clientes' ? 'CLIENTES ÚNICOS' : 'EMPRÉSTIMOS') : 'OPERAÇÕES NO GRÁFICO';
  $('#chart-manage-link').dataset.route = isLoans ? 'credito' : 'operacoes';
  $('#chart-manage-link').innerHTML = `${isLoans ? 'GERENCIAR EMPRÉSTIMOS' : 'GERENCIAR OPERAÇÕES'} <span>↗</span>`;
  $('#chart-index').innerHTML = '01<span>/04</span>';
  const chart = $('#pie-chart'); const empty = $('#empty-chart');
  empty.textContent = isLoans ? 'Cadastre empréstimos para visualizar o gráfico.' : 'Adicione operações para visualizar o gráfico.';
  if (!pieces.length) { chart.style.background = 'conic-gradient(#e6e5df 0 100%)'; empty.classList.add('visible'); }
  else {
    empty.classList.remove('visible'); let cursor = 0;
    const slices = pieces.map(({ pct, index }) => { const start = cursor; cursor += pct; return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`; });
    chart.style.background = `conic-gradient(${slices.join(',')})`;
  }
  $('#chart-legend').innerHTML = pieces.length ? pieces.map(item => `<div class="legend-item"><i class="legend-swatch" style="background:${COLORS[item.index % COLORS.length]}"></i><span class="legend-name" title="${esc(item.name)}">${esc(item.name)}</span><span class="legend-value">${percent(item.pct)}</span></div>`).join('') : `<div class="list-empty" style="grid-column:1/-1">Nenhum${isLoans ? ' empréstimo' : 'a operação'} cadastrado${isLoans ? '' : 'a'}.</div>`;
}
function renderAnalysis() {
  const totals = state.analysis?.totais || {};
  const cards = [['FATURAMENTO TOTAL', money(totals.faturamento)], ['LUCRO TOTAL', money(totals.valor_lucro)], ['CUSTO TOTAL', money(totals.valor_custo)], ['FUNCIONÁRIOS', number(totals.quantidade_funcionarios)]];
  $('#analysis-totals').innerHTML = cards.map(([label,value]) => `<div class="total-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
  const operations = state.analysis?.operacoes || [];
  $('#analysis-list').innerHTML = operations.length ? operations.map(op => `<article class="operation-row"><div class="operation-name">${esc(op.nome)}<small>OPERAÇÃO #${String(op.id).padStart(3,'0')}</small></div><div class="row-stat"><span>FATURAMENTO</span><strong>${money(op.faturamento)}</strong></div><div class="row-stat"><span>LUCRO · MARGEM ${percent(op.percentual_lucro)}</span><strong>${money(op.valor_lucro)}</strong></div><div class="row-stat"><span>CUSTO</span><strong>${money(op.valor_custo)}</strong></div><button class="row-action" data-view="${op.id}" aria-label="Ver ${esc(op.nome)}" title="Ver operação">↗</button></article>`).join('') : '<div class="list-empty">Ainda não existem operações. Adicione a primeira para começar.</div>';
  const loanTotals = state.loanAnalysis || {};
  $('#loan-analysis-totals').innerHTML = [['VALOR TOTAL A RECEBER', money(loanTotals.total_a_receber)], ['VALOR TOTAL EMPRESTADO', money(loanTotals.total_emprestado)], ['TAXA MÉDIA DE JUROS', percent(loanTotals.taxa_media)]].map(([label, value]) => `<div class="total-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
  const dueLoans = (state.loanAnalysis?.emprestimos || []).flatMap(loan => loan.vencimentos.map((dueDate, index) => ({ loan, dueDate, installment: index + 1 }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  $('#loan-analysis-list').innerHTML = dueLoans.length ? dueLoans.map(({ loan, dueDate, installment }) => `<article class="operation-row loan-row"><div class="operation-name">${esc(loan.nome_cliente)}<small>EMPRÉSTIMO #${String(loan.id).padStart(3, '0')}</small></div><div class="row-stat"><span>DIA DE PAGAMENTO</span><strong>${formatDate(dueDate)}</strong></div><div class="row-stat"><span>PARCELA</span><strong>${installment}/${loan.vencimentos.length}</strong></div><div class="row-stat"><span>TAXA</span><strong>${percent(loan.taxa_juros)}</strong></div><button class="row-action" data-loan-view="${loan.id}" aria-label="Ver empréstimo de ${esc(loan.nome_cliente)}" title="Ver empréstimo">↗</button></article>`).join('') : '<div class="list-empty">Ainda não existem empréstimos cadastrados.</div>';
  const loansSelected = state.analysisSource === 'emprestimos';
  $('#operations-analysis').classList.toggle('hidden', loansSelected);
  $('#loan-analysis').classList.toggle('hidden', !loansSelected);
  $$('.source-button[data-analysis-source]').forEach(button => button.classList.toggle('selected', button.dataset.analysisSource === state.analysisSource));
}
function formatDate(value) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)); }
function renderManage() {
  const operations = state.operations;
  $('#operation-count').textContent = `${operations.length} ${operations.length === 1 ? 'OPERAÇÃO' : 'OPERAÇÕES'}`;
  $('#manage-list').innerHTML = operations.length ? operations.map(op => `<article class="manage-item"><div><div class="manage-item-name">${esc(op.nome)}</div><div class="manage-item-sub">${money(op.faturamento)} FATURAMENTO · ${number(op.quantidade_funcionarios)} FUNC.</div></div><div class="manage-item-actions"><button class="small-action" data-view="${op.id}" aria-label="Visualizar ${esc(op.nome)}" title="Visualizar">↗</button><button class="small-action" data-edit="${op.id}" aria-label="Editar ${esc(op.nome)}" title="Editar">✎</button><button class="small-action delete" data-delete="${op.id}" aria-label="Remover ${esc(op.nome)}" title="Remover">×</button></div></article>`).join('') : '<div class="list-empty">Nenhuma operação cadastrada.<br>Use o formulário para adicionar a primeira.</div>';
}
function renderLoans() {
  $('#loan-count').textContent = `${state.loans.length} ${state.loans.length === 1 ? 'EMPRÉSTIMO' : 'EMPRÉSTIMOS'}`;
  $('#loan-list').innerHTML = state.loans.length ? state.loans.map(loan => {
    const nextDue = loan.vencimentos[0];
    return `<article class="manage-item"><div><div class="manage-item-name">${esc(loan.nome_cliente)}</div><div class="manage-item-sub">${money(loan.valor_emprestado)} · JUROS ${percent(loan.taxa_juros)} · MULTA ${money(loan.multa_diaria)}/DIA · PRÓXIMO VENC. ${formatDate(nextDue)}</div></div><div class="manage-item-actions"><button class="small-action" data-loan-view="${loan.id}" aria-label="Visualizar empréstimo de ${esc(loan.nome_cliente)}" title="Visualizar">↗</button><button class="small-action" data-loan-edit="${loan.id}" aria-label="Editar empréstimo de ${esc(loan.nome_cliente)}" title="Editar">✎</button><button class="small-action delete" data-loan-delete="${loan.id}" aria-label="Excluir empréstimo de ${esc(loan.nome_cliente)}" title="Excluir">×</button></div></article>`;
  }).join('') : '<div class="list-empty">Nenhum empréstimo cadastrado.<br>Use o formulário para criar o primeiro.</div>';
  $('#payments-list').innerHTML = state.payments.length ? state.payments.map(payment => `<article class="payment-row ${payment.pago ? 'paid' : ''}"><div class="payment-client"><strong>${esc(payment.nome_cliente)}</strong><small>EMPRÉSTIMO #${String(payment.emprestimo_id).padStart(3, '0')} · PARCELA ${payment.numero_parcela}/${payment.total_parcelas}</small></div><div><span>VALOR EMPRESTADO</span><strong>${money(payment.valor_emprestado)}</strong></div><div><span>TAXA TOTAL</span><strong>${percent(payment.taxa_juros)}</strong></div><div><span>JUROS DA PARCELA</span><strong>${money(payment.valor_a_receber)}</strong></div><div><span>MULTA ACUMULADA</span><strong>${money(payment.multa_acumulada)}</strong></div><div class="payment-total"><span>TOTAL A PAGAR</span><strong>${money(payment.valor_total)}</strong></div><div><span>DIA DE PAGAMENTO</span><strong>${formatDate(payment.data_vencimento)}</strong></div><div class="days-left ${payment.dias_restantes < 0 && !payment.pago ? 'overdue' : ''}"><span>${payment.pago ? 'STATUS' : payment.dias_restantes < 0 ? 'ATRASADO HÁ' : 'DIAS RESTANTES'}</span><strong>${payment.pago ? 'Pago' : `${Math.abs(payment.dias_restantes)} ${Math.abs(payment.dias_restantes) === 1 ? 'dia' : 'dias'}`}</strong></div><label class="payment-status"><span>CLIENTE PAGOU?</span><select data-payment-paid="${payment.pagamento_id}" aria-label="Cliente ${esc(payment.nome_cliente)} pagou?"><option value="false" ${payment.pago ? '' : 'selected'}>Não</option><option value="true" ${payment.pago ? 'selected' : ''}>Sim</option></select></label></article>`).join('') : '<div class="list-empty">Nenhum pagamento previsto. Cadastre um empréstimo para começar.</div>';
}
function render() { renderSummary(); renderChart(); renderAnalysis(); renderManage(); renderLoans(); }
function navigate(route) {
  const view = $(`#view-${route}`); if (!view) return;
  $$('.view').forEach(item => item.classList.toggle('active', item === view));
  $$('.section-nav-card').forEach(button => {
    const active = button.dataset.route === route;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (location.hash !== `#${route}`) history.pushState(null, '', `#${route}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (route === 'operacoes') $('#name').focus({ preventScroll: true });
}
function resetForm() {
  $('#operation-form').reset(); $('#operation-id').value = ''; $('#form-kicker').textContent = 'NOVA ENTRADA'; $('#form-heading').textContent = 'Adicionar operação'; $('#submit-button').innerHTML = 'ADICIONAR OPERAÇÃO <span>↗</span>'; $('#cancel-edit').classList.add('hidden'); $('#form-message').textContent = ''; $('#form-message').classList.remove('success');
}
function resetLoanForm() {
  $('#loan-form').reset(); $('#loan-id').value = ''; $('#loan-date').value = localDate(); $('#loan-term-type').value = 'dias'; $('#loan-term-value').value = '30';
  $('#loan-form-kicker').textContent = 'NOVO EMPRÉSTIMO'; $('#loan-form-heading').textContent = 'Criar empréstimo'; $('#loan-submit').innerHTML = 'CRIAR EMPRÉSTIMO <span>↗</span>';
  $('#loan-cancel').classList.add('hidden'); $('#loan-message').textContent = ''; $('#loan-term-label').firstChild.textContent = 'Tempo do empréstimo (dias)';
}
function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function editLoan(id) {
  const loan = state.loans.find(item => item.id === Number(id)); if (!loan) return;
  $('#loan-id').value = loan.id; $('#loan-client').value = loan.nome_cliente; $('#loan-date').value = loan.data_emprestimo;
  $('#loan-term-type').value = loan.tipo_prazo; $('#loan-term-value').value = loan.prazo_valor;
  $('#loan-rate').value = loan.taxa_juros; $('#loan-principal').value = loan.valor_emprestado; $('#loan-daily-fine').value = Number(loan.multa_diaria || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  updateLoanTermLabel(); $('#loan-form-kicker').textContent = `EDITANDO #${String(loan.id).padStart(3, '0')}`;
  $('#loan-form-heading').textContent = 'Editar empréstimo'; $('#loan-submit').innerHTML = 'SALVAR ALTERAÇÕES <span>↗</span>';
  $('#loan-cancel').classList.remove('hidden'); $('#loan-message').textContent = ''; $('#loan-client').focus({ preventScroll: true });
}
function updateLoanTermLabel() {
  const installments = $('#loan-term-type').value === 'parcelas';
  $('#loan-term-label').firstChild.textContent = installments ? 'Quantidade de parcelas mensais' : 'Tempo do empréstimo (dias)';
  $('#loan-term-value').max = installments ? '600' : '600';
}
function showLoan(id) {
  const loan = state.loans.find(item => item.id === Number(id)); if (!loan) return;
  $('#loan-dialog-title').textContent = loan.nome_cliente;
  $('#loan-dialog-id').textContent = `EMPRÉSTIMO #${String(loan.id).padStart(3, '0')}`;
  const interest = Number(loan.valor_a_receber || 0);
  const termDescription = loan.tipo_prazo === 'dias' ? `${loan.prazo_valor} dias` : `${loan.prazo_valor} parcelas mensais`;
  $('#loan-dialog-stats').innerHTML = [
    ['Dia do empréstimo', formatDate(loan.data_emprestimo)], ['Prazo', termDescription],
    ['Valor emprestado', money(loan.valor_emprestado)], ['Taxa de juros', percent(loan.taxa_juros)],
    ['Valor a receber (juros)', money(interest)], ['Multa diária', `${money(loan.multa_diaria)}/dia`], ['Vencimentos', loan.vencimentos.map(formatDate).join(', ')]
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  $('#loan-dialog').showModal();
}
function editOperation(id) {
  const op = state.operations.find(item => item.id === Number(id)); if (!op) return;
  $('#operation-id').value = op.id; $('#name').value = op.nome; $('#revenue').value = op.faturamento; $('#profit').value = op.valor_lucro; $('#cost').value = op.valor_custo; $('#employees').value = op.quantidade_funcionarios;
  $('#form-kicker').textContent = `EDITANDO #${String(op.id).padStart(3,'0')}`; $('#form-heading').textContent = 'Atualizar operação'; $('#submit-button').innerHTML = 'SALVAR ALTERAÇÕES <span>↗</span>'; $('#cancel-edit').classList.remove('hidden'); $('#form-message').textContent = ''; $('#name').focus({ preventScroll: true });
}
function showOperation(id) {
  const op = state.operations.find(item => item.id === Number(id)); if (!op) return;
  $('#dialog-title').textContent = op.nome;
  $('#dialog-id').textContent = `OPERAÇÃO #${String(op.id).padStart(3, '0')}`;
  $('#dialog-stats').innerHTML = [
    ['Faturamento', money(op.faturamento)],
    ['Lucro', `${money(op.valor_lucro)} · margem ${percent(op.faturamento ? Number(op.valor_lucro) / Number(op.faturamento) * 100 : 0)}`],
    ['Custo', money(op.valor_custo)],
    ['Funcionários', number(op.quantidade_funcionarios)]
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  $('#operation-dialog').showModal();
}
$('#operation-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return;
  const id = $('#operation-id').value;
  const payload = { nome: $('#name').value.trim(), faturamento: parseBrazilianNumber($('#revenue').value), valor_lucro: parseBrazilianNumber($('#profit').value), valor_custo: parseBrazilianNumber($('#cost').value), quantidade_funcionarios: Number($('#employees').value) };
  if (!payload.nome) return;
  if ([payload.faturamento, payload.valor_lucro, payload.valor_custo].some(value => value === null || value < 0)) { $('#form-message').textContent = 'Informe valores válidos usando vírgula para os centavos (ex.: 40.000,00).'; return; }
  state.busy = true; $('#submit-button').disabled = true; $('#submit-button').style.opacity = '.65';
  try {
    await request(id ? `${API}/${id}` : API, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    resetForm(); await loadData(false); toast(id ? 'Operação atualizada.' : 'Operação adicionada.');
  } catch (error) { $('#form-message').textContent = error.message; }
  finally { state.busy = false; $('#submit-button').disabled = false; $('#submit-button').style.opacity = ''; }
});
$('#cancel-edit').addEventListener('click', resetForm);
$('#loan-form').addEventListener('submit', async event => {
  event.preventDefault(); if (state.busy) return;
  const id = $('#loan-id').value;
  const payload = {
    nome_cliente: $('#loan-client').value.trim(), data_emprestimo: $('#loan-date').value,
    tipo_prazo: $('#loan-term-type').value, prazo_valor: Number($('#loan-term-value').value),
    taxa_juros: Number($('#loan-rate').value), valor_emprestado: parseBrazilianNumber($('#loan-principal').value), multa_diaria: parseBrazilianNumber($('#loan-daily-fine').value)
  };
  if (!payload.nome_cliente) return;
  if (payload.valor_emprestado === null || payload.valor_emprestado <= 0 || payload.multa_diaria === null || payload.multa_diaria < 0) { $('#loan-message').textContent = 'Informe valores válidos para o empréstimo e a multa diária.'; return; }
  state.busy = true; $('#loan-submit').disabled = true;
  try {
    await request(id ? `${LOANS_API}/${id}` : LOANS_API, { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    resetLoanForm(); await loadData(false); toast(id ? 'Empréstimo atualizado.' : 'Empréstimo criado.');
  } catch (error) { $('#loan-message').textContent = error.message; }
  finally { state.busy = false; $('#loan-submit').disabled = false; }
});
$('#loan-cancel').addEventListener('click', resetLoanForm);
$('#loan-term-type').addEventListener('change', updateLoanTermLabel);
document.addEventListener('click', async event => {
  const routeButton = event.target.closest('[data-route]'); if (routeButton) { navigate(routeButton.dataset.route); return; }
  const closeDialog = event.target.closest('[data-close-dialog]'); if (closeDialog) { closeDialog.closest('dialog').close(); return; }
  const metricButton = event.target.closest('[data-metric]'); if (metricButton) { state.metric = metricButton.dataset.metric; renderChart(); return; }
  const loanMetricButton = event.target.closest('[data-loan-metric]'); if (loanMetricButton) { state.loanMetric = loanMetricButton.dataset.loanMetric; $$('.metric-button[data-loan-metric]').forEach(button => button.classList.toggle('selected', button === loanMetricButton)); renderChart(); return; }
  const chartSource = event.target.closest('[data-chart-source]'); if (chartSource) { state.chartSource = chartSource.dataset.chartSource; renderChart(); return; }
  const analysisSource = event.target.closest('[data-analysis-source]'); if (analysisSource) { state.analysisSource = analysisSource.dataset.analysisSource; renderAnalysis(); return; }
  const editButton = event.target.closest('[data-edit]'); if (editButton) { editOperation(editButton.dataset.edit); return; }
  const viewButton = event.target.closest('[data-view]'); if (viewButton) { showOperation(viewButton.dataset.view); return; }
  const loanEditButton = event.target.closest('[data-loan-edit]'); if (loanEditButton) { editLoan(loanEditButton.dataset.loanEdit); return; }
  const loanViewButton = event.target.closest('[data-loan-view]'); if (loanViewButton) { showLoan(loanViewButton.dataset.loanView); return; }
  const loanDeleteButton = event.target.closest('[data-loan-delete]');
  if (loanDeleteButton) {
    const loan = state.loans.find(item => item.id === Number(loanDeleteButton.dataset.loanDelete)); if (!loan) return;
    if (!window.confirm(`Excluir o empréstimo de ${loan.nome_cliente}?`)) return;
    try { await request(`${LOANS_API}/${loan.id}`, { method: 'DELETE' }); if ($('#loan-id').value === String(loan.id)) resetLoanForm(); await loadData(false); toast('Empréstimo excluído.'); }
    catch (error) { toast(error.message); }
    return;
  }
  const deleteButton = event.target.closest('[data-delete]');
  if (deleteButton) {
    const op = state.operations.find(item => item.id === Number(deleteButton.dataset.delete)); if (!op) return;
    if (!window.confirm(`Remover a operação “${op.nome}”?`)) return;
    try { await request(`${API}/${op.id}`, { method: 'DELETE' }); if ($('#operation-id').value === String(op.id)) resetForm(); await loadData(false); toast('Operação removida.'); }
    catch (error) { toast(error.message); }
  }
});
document.addEventListener('change', async event => {
  const paymentSelect = event.target.closest('[data-payment-paid]'); if (!paymentSelect) return;
  paymentSelect.disabled = true;
  try {
    await request(`${API_BASE}/pagamentos/${paymentSelect.dataset.paymentPaid}`, {
      method: 'PATCH', body: JSON.stringify({ pago: paymentSelect.value === 'true' })
    });
    await loadData(false); toast(paymentSelect.value === 'true' ? 'Pagamento registrado; atraso zerado.' : 'Pagamento marcado como pendente.');
  } catch (error) { toast(error.message); await loadData(false); }
});
$('#refresh-button').addEventListener('click', () => loadData());
$('#profile-button').addEventListener('click', openProfile);
$('#profile-name-input').addEventListener('input', event => {
  if (!draftProfilePhoto) renderAvatar($('#profile-avatar-preview'), '', event.currentTarget.value || profileName);
});
$('#choose-profile-photo').addEventListener('click', () => $('#profile-photo-input').click());
$('#profile-photo-input').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { draftProfilePhoto = await readProfilePhoto(file); renderAvatar($('#profile-avatar-preview'), draftProfilePhoto, $('#profile-name-input').value || profileName); $('#profile-message').textContent = ''; }
  catch (error) { $('#profile-message').textContent = error.message; }
  finally { event.target.value = ''; }
});
$('#profile-form').addEventListener('submit', event => {
  event.preventDefault();
  const nextName = $('#profile-name-input').value.trim();
  if (!nextName) { $('#profile-message').textContent = 'Informe um nome para o perfil.'; return; }
  try {
    localStorage.setItem('elite-profile-name', nextName);
    if (draftProfilePhoto) localStorage.setItem('elite-profile-photo', draftProfilePhoto);
    else localStorage.removeItem('elite-profile-photo');
    profileName = nextName; profilePhoto = draftProfilePhoto;
    $('#profile-name').textContent = profileName;
    renderAvatar($('#profile-avatar'), profilePhoto, profileName);
    $('#profile-dialog').close();
  } catch { $('#profile-message').textContent = 'Não foi possível salvar o perfil neste navegador.'; }
});
$$('[data-close-profile]').forEach(button => button.addEventListener('click', () => $('#profile-dialog').close()));
$('#profile-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$('#operation-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$('#loan-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { if ($('#operation-dialog').open) $('#operation-dialog').close(); if ($('#loan-dialog').open) $('#loan-dialog').close(); } });
window.addEventListener('popstate', () => { const route = location.hash.slice(1) || 'inicio'; navigate(route); });
window.addEventListener('hashchange', () => { const route = location.hash.slice(1) || 'inicio'; if ($(`#view-${route}`)) navigate(route); });
$('.year').textContent = new Date().getFullYear();
$('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(new Date()).toUpperCase();
const initialRoute = location.hash.slice(1) || 'inicio'; if ($(`#view-${initialRoute}`)) navigate(initialRoute);
initProfile();
resetLoanForm();
loadData();
