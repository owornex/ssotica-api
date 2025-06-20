require('dotenv').config();
const { chromium } = require('playwright');
const express = require('express');
const app = express();

app.use(express.json());

let browser; // Variável global para o navegador persistente

// Função para inicializar o navegador
async function initializeBrowser() {
    if (!browser) {
        browser = await chromium.launch({ headless: true });
        console.log('Browser initialized successfully.');
    }
}

// Função para encerrar o navegador graciosamente
async function gracefulShutdown() {
    console.log('Shutting down gracefully...');
    if (browser) {
        await browser.close();
        console.log('Browser closed.');
    }
    process.exit(0);
}

// Manipuladores para SIGINT e SIGTERM
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

app.post('/api/consultar', async (req, res) => {
    const { nome } = req.body;
    if (!nome) {
        return res.status(400).json({ error: 'Nome do cliente é obrigatório' });
    }

    if (!browser) {
        console.error('Browser not initialized when API was called.');
        return res.status(503).json({ error: 'Serviço temporariamente indisponível, navegador não inicializado.' });
    }

    let context; // Declarar context aqui para estar acessível no finally

    try {
        context = await browser.newContext(); // Criar novo contexto a partir do navegador persistente
        const page = await context.newPage();

        // --- Configuration from Environment Variables (with defaults) ---
        // Base URL of the SSOtica application
        const baseUrl = process.env.SSOTICA_BASE_URL || 'https://app.ssotica.com.br';
        // Path to the "Contas a Receber" page
        const contasAReceberPath = process.env.SSOTICA_CONTAS_A_RECEBER_PATH || '/financeiro/contas-a-receber/LwlRRM/listar';
        // Value for the search type select element (e.g., search by 'nome_apelido')
        const searchTypeValue = process.env.SSOTICA_SEARCH_TYPE_VALUE || 'nome_apelido';
        // Keyword to identify an "open" status installment
        const statusAberto = process.env.STATUS_FILTER_ABERTO || 'aberto';
        // Keyword to identify an "overdue" status installment
        const statusAtraso = process.env.STATUS_FILTER_ATRASO || 'atraso';
        // Timeout in milliseconds for waiting for search results to appear
        const waitForResultsTimeout = parseInt(process.env.WAIT_FOR_RESULTS_TIMEOUT || '10000', 10);

        // --- Login Steps to SSOtica ---
        try {
            // Navigate to the base URL (login page)
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

            // Fill in email
            await page.waitForSelector('#email');
            await page.fill('#email', process.env.SSOTICA_EMAIL);

            // Fill in password
            await page.waitForSelector('#senha');
            await page.fill('#senha', process.env.SSOTICA_PASSWORD);

            // Click the login button
            await page.waitForSelector('button.button.bgBlue');
            await page.click('button.button.bgBlue');

            // Wait for navigation to complete after login
            await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        } catch (loginError) {
            console.error(`Erro ao tentar fazer login para o cliente: ${nome}:`, loginError);
            // Não fechar o browser aqui, apenas o contexto no finally
            return res.status(500).json({ error: "Falha ao realizar login no sistema externo." });
        }

        // --- Navigation to Client's Account Receivables and Data Extraction ---
        let parcelas;
        try {
            // Navigate to the "Contas a Receber" page
            await page.goto(`${baseUrl}${contasAReceberPath}`, { waitUntil: 'domcontentloaded' });

            // Fill in the client's name in the search field
            await page.waitForSelector('input[name="searchTerm_Parcelamento"]');
            await page.fill('input[name="searchTerm_Parcelamento"]', nome);

            // Ensure the search type is set correctly (e.g., to search by name/nickname)
            await page.selectOption('select[name="searchTermSelect_Parcelamento"]', searchTypeValue);

            // Click the search button
            await page.click('button:has-text("Buscar")');

            // Wait for search results to load.
            // This waits for the list item selector to appear.
            // Wait for the first result item to appear, or for a container if that's more reliable
            // If no items are found, this will throw an error, caught by the catch block.
            try {
                await page.waitForSelector('li.item-conta-a-receber', { timeout: waitForResultsTimeout });
            } catch (e) {
                // If items don't appear, it could be a valid "no results found" scenario for this specific search term
                // Or it could be an actual error if the page structure changed.
                // For now, we'll let the existing logic handle it: parcelas will be empty, leading to a 404 or other handling.
                // If parcelas.$$eval fails or returns empty, it will be handled later.
                // If it's a genuine error (not just no results), the broader catch will get it.
                // We could also check here if a "no results" message is displayed by the website.
                console.warn(`Nenhum resultado encontrado para o cliente ${nome} via seletor 'li.item-conta-a-receber' dentro do timeout.`);
            }

            // Extract installment data from the list items
            parcelas = await page.$$eval('li.item-conta-a-receber', items => {
            return items.map(item => {
                // Description of the installment (e.g., "MANUTENCAO DE SISTEMA")
                const descricao = item.querySelector('.descricao-conta-a-receber')?.innerText.trim() || '';
                // Associated sale number (e.g., "12345")
                const venda = item.innerText.match(/Venda nº (\d+)/)?.[1] || '';
                // Value of the installment (e.g., "R$ 100,00")
                const valor = item.querySelector('.valor-conta-a-receber')?.innerText.trim() || '';
                // Due date of the installment (DD/MM/YYYY)
                const vencimento = item.innerText.match(/Vencimento: (\d{2}\/\d{2}\/\d{4})/)?.[1] || '';
                // Status of the installment (e.g., "EM ABERTO", "PAGO EM ATRASO")
                const status = item.querySelector('.status-conta-a-receber')?.innerText.trim() || '';

                return { descricao, venda, valor, vencimento, status };
            });
        });
        } catch (navigationError) {
            console.error(`Erro ao buscar/extrair dados para o cliente: ${nome}:`, navigationError);
            // Não fechar o browser aqui, apenas o contexto no finally
            return res.status(500).json({ error: "Falha ao navegar ou buscar dados no sistema externo." });
        }

        // If no installments were found at all for the client
        if (!parcelas.length) {
            return res.status(404).json({ message: 'Nenhuma parcela encontrada.' });
        }

        // --- Data Processing: Filtering and Sorting ---
        // --- Data Processing: Filtering and Sorting ---
        const parcelasValidas = filtrarParcelas(parcelas, statusAberto, statusAtraso);

        if (!parcelasValidas.length) {
            return res.status(404).json({ message: 'Nenhuma parcela em aberto ou em atraso com data de vencimento válida encontrada.' });
        }

        const parcelasOrdenadas = ordenarParcelasPorVencimento(parcelasValidas);

        if (!parcelasOrdenadas || parcelasOrdenadas.length === 0) {
            // This case should ideally be covered by parcelasValidas.length check,
            // but as an extra safeguard if ordenarParcelasPorVencimento could return empty/null.
            return res.status(404).json({ message: 'Nenhuma parcela válida encontrada após ordenação.' });
        }
        const parcelaAtual = parcelasOrdenadas[0];

        return res.json({
            cliente: nome,
            parcela_atual: parcelaAtual
        });

    } catch (error) {
        console.error(`Erro inesperado na API para o cliente ${nome}:`, error);
        // Não fechar o browser aqui, apenas o contexto no finally
        return res.status(500).json({ error: "Ocorreu um erro ao processar a solicitação." });
    } finally {
        if (context) {
            await context.close(); // Garante que o contexto seja fechado
        }
    }
});

const PORT = process.env.PORT || 3189;

// Inicializa o browser e então inicia o servidor, apenas se o script for executado diretamente
if (require.main === module) {
    (async () => {
        try {
            await initializeBrowser();
            app.listen(PORT, () => {
                console.log(`API rodando na porta ${PORT}`);
            });
        } catch (error) {
            console.error('Failed to initialize browser or start server:', error);
            if (browser) { // Tenta fechar o browser se ele foi parcialmente inicializado
                await browser.close();
            }
            process.exit(1); // Sai se o navegador não puder ser inicializado
        }
    })();
}

// --- Helper Functions for Data Processing ---

// Filter installments to include only those with relevant status (e.g., "open", "overdue")
// and a valid due date format (DD/MM/YYYY).
function filtrarParcelas(parcelas, statusAberto, statusAtraso) {
    if (!parcelas || !Array.isArray(parcelas)) {
        return [];
    }
    return parcelas.filter(p => {
        // Ensure p.status and p.vencimento are not null or undefined before calling methods on them
        const currentStatus = p.status ? p.status.toLowerCase() : "";
        const hasValidStatus = currentStatus.includes(statusAberto) ||
                             currentStatus.includes(statusAtraso);

        const currentVencimento = p.vencimento || "";
        const hasValidVencimentoFormat = /^\d{2}\/\d{2}\/\d{4}$/.test(currentVencimento);

        return hasValidStatus && hasValidVencimentoFormat;
    });
}

// Sort valid installments by due date, from nearest to furthest.
// Installments with invalid dates (that might have unexpectedly passed the format check) are moved to the end.
function ordenarParcelasPorVencimento(parcelas) {
    if (!parcelas || !Array.isArray(parcelas) || parcelas.length === 0) {
        return [];
    }
    // Use spread to sort a new array, to avoid mutating the original 'parcelasValidas'
    return [...parcelas].sort((a, b) => {
        const partsA = a.vencimento.split('/');
        const partsB = b.vencimento.split('/');

        const dateA = new Date(`${partsA[2]}-${partsA[1]}-${partsA[0]}`); // YYYY-MM-DD
        const dateB = new Date(`${partsB[2]}-${partsB[1]}-${partsB[0]}`); // YYYY-MM-DD

        // Check if the constructed date is valid by comparing the month
        // new Date() can roll over invalid days to the next month (e.g., 30/02 becomes 01/03 or 02/03)
        // We consider such dates invalid for sorting if the month changed.
        // Note: JavaScript months are 0-indexed (0 for January, 1 for February, etc.)
        const originalMonthA = parseInt(partsA[1], 10);
        const originalMonthB = parseInt(partsB[1], 10);

        // getTime() will be NaN for completely unparseable dates (though regex filter should prevent most)
        // or if the year is out of reasonable bounds for Date object.
        const timeA = dateA.getTime();
        const timeB = dateB.getTime();

        // Check for NaN or if the month rolled over
        const isDateAInvalid = isNaN(timeA) || dateA.getMonth() + 1 !== originalMonthA;
        const isDateBInvalid = isNaN(timeB) || dateB.getMonth() + 1 !== originalMonthB;

        if (isDateAInvalid && isDateBInvalid) return 0;
        if (isDateAInvalid) return 1;  // dateA is invalid, sort it after valid dateB
        if (isDateBInvalid) return -1; // dateB is invalid, sort it after valid dateA

        return timeA - timeB; // Both are valid and parsed correctly
    });
}

function getBrowserInstance() { // Helper function to access the browser instance if needed
    return browser;
}

module.exports = {
    filtrarParcelas,
    ordenarParcelasPorVencimento,
    app,
    initializeBrowser, // Export for testing
    getBrowserInstance // Export for testing/inspection if necessary
};
