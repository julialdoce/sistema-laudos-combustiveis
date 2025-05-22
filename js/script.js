// Configuração dos tanques e tipos de combustível
const TANQUES = {
    "TQ-11": "Gasolina",
    "TQ-1001": "Diesel S500",
    "TQ-17": "Diesel S-10",
    "TQ-19": "Diesel S-10",
    "TQ-1": "Etanol Hidratado",
    "TQ-5": "Etanol Hidratado",
    "TQ-6": "Etanol Hidratado",
    "TQ-8": "Etanol Hidratado",
    "TQ-22": "Diesel Marítimo",
    "TQ-09": "Biodiesel",
    "TQ-14": "Etanol Anidro",
    "TQ-18": "Etanol Anidro"
};

// Classe para gerenciar os dados
class GerenciadorLaudos {
    constructor() {
        this.laudos = this.carregarDados();
        this.inicializar();
    }

    carregarDados() {
        const dados = localStorage.getItem('laudosCombustiveis');
        return dados ? JSON.parse(dados) : [];
    }

    salvarDados() {
        localStorage.setItem('laudosCombustiveis', JSON.stringify(this.laudos));
        this.atualizarInterface();
    }

    adicionarLaudo(laudo) {
        // Verifica se já existe laudo com essa batelada
        const existe = this.laudos.find(l => l.numeroBatelada === laudo.numeroBatelada);
        if (existe) {
            this.mostrarAlerta('warning', `Batelada ${laudo.numeroBatelada} já existe no sistema!`);
            return false;
        }

        laudo.id = Date.now();
        laudo.dataImportacao = new Date().toISOString();
        laudo.status = 'Pendente';
        
        this.laudos.push(laudo);
        this.salvarDados();
        
        this.mostrarAlerta('success', `Laudo da batelada ${laudo.numeroBatelada} importado com sucesso!`);
        return true;
    }

    atualizarStatus(id, novoStatus) {
        const laudo = this.laudos.find(l => l.id === id);
        if (laudo) {
            laudo.status = novoStatus;
            this.salvarDados();
            this.mostrarAlerta('success', `Status atualizado para: ${novoStatus}`);
        }
    }

    removerLaudo(id) {
        this.laudos = this.laudos.filter(l => l.id !== id);
        this.salvarDados();
        this.mostrarAlerta('success', 'Laudo removido com sucesso!');
    }

    obterEstatisticas() {
        const total = this.laudos.length;
        const pendentes = this.laudos.filter(l => l.status === 'Pendente').length;
        const validados = this.laudos.filter(l => l.status === 'Validado').length;
        const tanquesAtivos = new Set(this.laudos.map(l => l.tanque)).size;

        return { total, pendentes, validados, tanquesAtivos };
    }

    obterUltimaBatelada(tanque) {
        const laudosTanque = this.laudos.filter(l => l.tanque === tanque);
        if (laudosTanque.length === 0) return null;
        
        return laudosTanque.sort((a, b) => new Date(b.dataLaudo) - new Date(a.dataLaudo))[0];
    }

    inicializar() {
        this.configurarEventos();
        this.atualizarInterface();
    }

    configurarEventos() {
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.querySelector('.upload-area');
        const filtroTanque = document.getElementById('filtroTanque');

        // Upload de arquivos
        fileInput.addEventListener('change', (e) => this.processarArquivos(e.target.files));

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.processarArquivos(e.dataTransfer.files);
        });

        // Filtro
        filtroTanque.addEventListener('input', () => this.filtrarTabela());
    }

    async processarArquivos(files) {
        const loading = document.getElementById('loading');
        loading.style.display = 'block';

        for (let file of files) {
            if (file.type === 'application/pdf') {
                try {
                    const laudo = await this.extrairInformacoesPDF(file);
                    if (laudo) {
                        this.adicionarLaudo(laudo);
                    }
                } catch (error) {
                    console.error('Erro ao processar arquivo:', error);
                    this.mostrarAlerta('danger', `Erro ao processar ${file.name}`);
                }
            }
        }

        loading.style.display = 'none';
    }

    async extrairInformacoesPDF(file) {
        return new Promise((resolve) => {
            const fileReader = new FileReader();
            fileReader.onload = async function() {
                try {
                    const typedArray = new Uint8Array(this.result);
                    const pdf = await pdfjsLib.getDocument(typedArray).promise;
                    
                    let textoCompleto = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        textoCompleto += pageText + ' ';
                    }

                    const informacoes = gerenciador.extrairInformacoesTexto(textoCompleto, file.name);
                    resolve(informacoes);
                } catch (error) {
                    console.error('Erro ao extrair texto do PDF:', error);
                    resolve(null);
                }
            };
            fileReader.readAsArrayBuffer(file);
        });
    }

    extrairInformacoesTexto(texto, nomeArquivo) {
        // Busca por padrões de tanque
        let tanque = null;
        for (let codigoTanque of Object.keys(TANQUES)) {
            if (texto.includes(codigoTanque) || nomeArquivo.includes(codigoTanque)) {
                tanque = codigoTanque;
                break;
            }
        }

        // Busca por número de batelada
        const regexBatelada = /(?:batelada|lote|batch)[:\s]*([A-Z0-9\-]+)/i;
        const matchBatelada = texto.match(regexBatelada) || nomeArquivo.match(/([A-Z0-9\-]{3,})/);
        const numeroBatelada = matchBatelada ? matchBatelada[1] : `BATCH_${Date.now()}`;

        // Busca por data
        const regexData = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
        const matchData = texto.match(regexData);
        let dataLaudo = new Date().toISOString().split('T')[0];
        
        if (matchData) {
            const [, dia, mes, ano] = matchData;
            dataLaudo = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
        }

        if (!tanque) {
            this.mostrarAlerta('warning', `Não foi possível identificar o tanque no arquivo ${nomeArquivo}`);
            return null;
        }

        return {
            tanque: tanque,
            tipoCombustivel: TANQUES[tanque],
            numeroBatelada: numeroBatelada,
            dataLaudo: dataLaudo,
            nomeArquivo: nomeArquivo
        };
    }

    atualizarInterface() {
        this.atualizarEstatisticas();
        this.atualizarDashboardTanques();
        this.atualizarTabelaLaudos();
    }

    atualizarEstatisticas() {
        const stats = this.obterEstatisticas();
        document.getElementById('totalLaudos').textContent = stats.total;
        document.getElementById('laudosPendentes').textContent = stats.pendentes;
        document.getElementById('laudosValidados').textContent = stats.validados;
        document.getElementById('tanquesAtivos').textContent = stats.tanquesAtivos;
    }

    atualizarDashboardTanques() {
        const dashboard = document.getElementById('tankDashboard');
        dashboard.innerHTML = '';

        Object.entries(TANQUES).forEach(([codigoTanque, tipoCombustivel]) => {
            const ultimaBatelada = this.obterUltimaBatelada(codigoTanque);
            
            const tankCard = document.createElement('div');
            tankCard.className = 'tank-card';
            
            let statusInfo = '<span style="color: #95a5a6;">Sem dados</span>';
            let bateladaInfo = 'N/A';
            let dataInfo = 'N/A';
            
            if (ultimaBatelada) {
                const statusClass = `status-${ultimaBatelada.status.toLowerCase()}`;
                statusInfo = `<span class="status-badge ${statusClass}">${ultimaBatelada.status}</span>`;
                bateladaInfo = ultimaBatelada.numeroBatelada;
                dataInfo = new Date(ultimaBatelada.dataLaudo).toLocaleDateString('pt-BR');
            }

            tankCard.innerHTML = `
                <div class="tank-header">
                    <div class="tank-name">${codigoTanque}</div>
                    <div class="fuel-type">${tipoCombustivel}</div>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Última Batelada:</strong> ${bateladaInfo}
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Data:</strong> ${dataInfo}
                </div>
                <div>
                    <strong>Status:</strong> ${statusInfo}
                </div>
            `;
            
            dashboard.appendChild(tankCard);
        });
    }

    atualizarTabelaLaudos() {
        const tbody = document.getElementById('laudosTableBody');
        tbody.innerHTML = '';

        const laudosOrdenados = [...this.laudos].sort((a, b) => new Date(b.dataLaudo) - new Date(a.dataLaudo));

        laudosOrdenados.forEach(laudo => {
            const row = document.createElement('tr');
            const statusClass = `status-${laudo.status.toLowerCase()}`;
            
            row.innerHTML = `
                <td><strong>${laudo.tanque}</strong></td>
                <td>${laudo.tipoCombustivel}</td>
                <td>${laudo.numeroBatelada}</td>
                <td>${new Date(laudo.dataLaudo).toLocaleDateString('pt-BR')}</td>
                <td><span class="status-badge ${statusClass}">${laudo.status}</span></td>
                <td>
                    <button class="btn btn-success" onclick="gerenciador.atualizarStatus(${laudo.id}, 'Validado')" style="padding: 5px 10px; font-size: 0.8em;">✓</button>
                    <button class="btn btn-danger" onclick="gerenciador.atualizarStatus(${laudo.id}, 'Rejeitado')" style="padding: 5px 10px; font-size: 0.8em;">✗</button>
                    <button class="btn btn-danger" onclick="gerenciador.removerLaudo(${laudo.id})" style="padding: 5px 10px; font-size: 0.8em;">🗑️</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    filtrarTabela() {
        const filtro = document.getElementById('filtroTanque').value.toLowerCase();
        const rows = document.querySelectorAll('#laudosTableBody tr');
        
        rows.forEach(row => {
            const tanque = row.cells[0].textContent.toLowerCase();
            const combustivel = row.cells[1].textContent.toLowerCase();
            const batelada = row.cells[2].textContent.toLowerCase();
            
            if (tanque.includes(filtro) || combustivel.includes(filtro) || batelada.includes(filtro)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    mostrarAlerta(tipo, mensagem) {
        const alertContainer = document.getElementById('alertContainer');
        const alert = document.createElement('div');
        alert.className = `alert alert-${tipo}`;
        alert.textContent = mensagem;
        alert.style.display = 'block';
        
        alertContainer.appendChild(alert);
        
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }

    exportarDados() {
        const dados = {
            exportadoEm: new Date().toISOString(),
            totalLaudos: this.laudos.length,
            laudos: this.laudos
        };
        
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laudos_combustiveis_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.mostrarAlerta('success', 'Dados exportados com sucesso!');
    }

    limparDados() {
        if (confirm('Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita.')) {
            this.laudos = [];
            this.salvarDados();
            this.mostrarAlerta('success', 'Todos os dados foram removidos.');
        }
    }
}

// Funções globais
function exportarDados() {
    gerenciador.exportarDados();
}

function limparDados() {
    gerenciador.limparDados();
}

// Inicializar o sistema
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const gerenciador = new GerenciadorLaudos();
