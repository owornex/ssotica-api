require('dotenv').config(); // Load environment variables from .env file
const { chromium } = require('playwright'); // Import Playwright's Chromium module
const express = require('express'); // Import Express framework
const app = express(); // Initialize Express application

app.use(express.json()); // Middleware to parse JSON request bodies

// Holds the persistent Playwright browser instance.
// Using a global variable allows the browser to be initialized once and reused across requests,
// improving performance by avoiding repeated browser launches.
let browser;

// --- Browser Initialization and Shutdown ---

/**
 * Initializes a persistent Playwright Chromium browser instance if one doesn't already exist.
 * This function is called at server startup.
 * Using a single browser instance is more efficient than launching a new one for each request.
 */
async function initializeBrowser() {
    if (!browser) {
        try {
            browser = await chromium.launch({ headless: true }); // Launch headless Chromium
            console.log('Browser initialized successfully.');
        } catch (error) {
            console.error('Failed to initialize browser:', error);
            process.exit(1); // Exit if browser fails to initialize, as the service cannot function
        }
    }
}

/**
 * Gracefully shuts down the Playwright browser instance.
 * This function is triggered by SIGINT (Ctrl+C) and SIGTERM signals to ensure
 * the browser is closed properly before the process exits.
 */
async function gracefulShutdown() {
    console.log('Shutting down gracefully...');
    if (browser) {
        try {
            await browser.close(); // Close the browser
            console.log('Browser closed.');
        } catch (error) {
            console.error('Error closing browser during shutdown:', error);
        }
    }
    process.exit(0); // Exit the process
}

// Register signal handlers for graceful shutdown
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// --- API Endpoint: /api/consultar ---

/**
 * POST /api/consultar
 * Endpoint to consult client installments from the SSOtica system.
 * It performs web scraping using Playwright to log in, search for the client,
 * extract installment data, filter for relevant ones, and return the one
 * with the nearest due date.
 */
app.post('/api/consultar', async (req, res) => {
    const { nome } = req.body; // Extract client name from request body

    // Validate input
    if (!nome) {
        return res.status(400).json({ error: 'Nome do cliente é obrigatório' });
    }

    // --- Browser/Context Management ---
    // Check if the global browser instance is initialized
    if (!browser) {
        console.error('Browser not initialized when API was called.');
        // Return 503 if browser isn't ready, as the service is temporarily unavailable
        return res.status(503).json({ error: 'Serviço temporariamente indisponível, navegador não inicializado.' });
    }

    let context; // Playwright browser context for this request

    try {
        // Create a new incognito browser context for this request.
        // This provides isolation between different API calls.
        context = await browser.newContext();
        const page = await context.newPage(); // Create a new page within the context

        // --- Configuration from Environment Variables ---
        // These variables define how the scraper interacts with the SSOtica system.
        const baseUrl = process.env.SSOTICA_BASE_URL || 'https://app.ssotica.com.br'; // Base URL for SSOtica
        const contasAReceberPath = process.env.SSOTICA_CONTAS_A_RECEBER_PATH || '/financeiro/contas-a-receber/LwlRRM/listar'; // Path to the accounts receivable page
        const searchTypeValue = process.env.SSOTICA_SEARCH_TYPE_VALUE || 'nome_apelido'; // Value for the search type dropdown (e.g., by name)
        const statusAberto = (process.env.STATUS_FILTER_ABERTO || 'aberto').toLowerCase(); // Keyword for "open" status installments
        const statusAtraso = (process.env.STATUS_FILTER_ATRASO || 'atraso').toLowerCase(); // Keyword for "overdue" status installments
        const waitForResultsTimeout = parseInt(process.env.WAIT_FOR_RESULTS_TIMEOUT || '10000', 10); // Timeout for waiting for search results

        // --- Login Steps to SSOtica ---
        try {
            // Navigate to the SSOtica login page
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

            // Wait for the email field to be available and fill it
            await page.waitForSelector('#email', { timeout: 10000 }); // Wait for email input
            await page.fill('#email', process.env.SSOTICA_EMAIL); // Fill email from .env

            // Wait for the password field to be available and fill it
            await page.waitForSelector('#senha', { timeout: 10000 }); // Wait for password input
            await page.fill('#senha', process.env.SSOTICA_PASSWORD); // Fill password from .env

            // Wait for the login button to be available and click it
            await page.waitForSelector('button.button.bgBlue', { timeout: 10000 }); // Wait for login button
            await page.click('button.button.bgBlue'); // Click login button

            // Wait for navigation to complete after login (e.g., to dashboard)
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (loginError) {
            console.error(`Erro ao tentar fazer login para o cliente: ${nome}:`, loginError);
            // If login fails, it's a server-side issue with accessing the external system.
            return res.status(500).json({ error: "Falha ao realizar login no sistema externo." });
        }

        // --- Navigation to Client's Account Receivables and Data Extraction ---
        let parcelas; // Array to store extracted installment data
        try {
            // Navigate to the "Contas a Receber" (Accounts Receivable) page
            await page.goto(`${baseUrl}${contasAReceberPath}`, { waitUntil: 'domcontentloaded' });

            // Wait for the search input field and fill in the client's name
            await page.waitForSelector('input[name="searchTerm_Parcelamento"]', { timeout: 10000 });
            await page.fill('input[name="searchTerm_Parcelamento"]', nome);

            // Select the search type (e.g., by client name/nickname) using the value from .env
            await page.selectOption('select[name="searchTermSelect_Parcelamento"]', searchTypeValue);

            // Click the search button
            await page.click('button:has-text("Buscar")');

            // Wait for the search results (list items) to appear on the page.
            // If no results are found within the timeout, a warning is logged.
            // The `waitForResultsTimeout` from .env is used here.
            try {
                await page.waitForSelector('li.item-conta-a-receber', { timeout: waitForResultsTimeout });
            } catch (e) {
                // This catch block handles the case where the selector for results does not appear.
                // It could mean no results were found for the client, or the page structure changed.
                // The subsequent page.$$eval will likely return an empty array, leading to a 404 if no parcels.
                console.warn(`Timeout or no results found for selector 'li.item-conta-a-receber' for client ${nome}. This might be normal if client has no parcels.`);
            }

            // Extract data from each installment item found on the page.
            // page.$$eval runs document.querySelectorAll within the page and passes the results to the callback.
            parcelas = await page.$$eval('li.item-conta-a-receber', items => {
                return items.map(item => {
                    const descricao = item.querySelector('.descricao-conta-a-receber')?.innerText.trim() || '';
                    const venda = item.innerText.match(/Venda nº (\d+)/)?.[1] || '';
                    const valor = item.querySelector('.valor-conta-a-receber')?.innerText.trim() || '';
                    const vencimento = item.innerText.match(/Vencimento: (\d{2}\/\d{2}\/\d{4})/)?.[1] || '';
                    const status = item.querySelector('.status-conta-a-receber')?.innerText.trim() || '';
                    return { descricao, venda, valor, vencimento, status };
                });
            });
        } catch (navigationError) {
            console.error(`Erro ao buscar/extrair dados para o cliente: ${nome}:`, navigationError);
            // Errors here could be due to changes in SSOtica's website structure or network issues.
            return res.status(500).json({ error: "Falha ao navegar ou buscar dados no sistema externo." });
        }

        // --- Data Processing: Filtering and Sorting ---

        // If scraping yielded no installment items at all.
        if (!parcelas || parcelas.length === 0) {
            return res.status(404).json({ message: 'Nenhuma parcela encontrada para o cliente no sistema externo.' });
        }

        // Filter installments to get only relevant ones (open/overdue with valid dates)
        // Uses status keywords from .env for filtering.
        const parcelasValidas = filtrarParcelas(parcelas, statusAberto, statusAtraso);

        if (!parcelasValidas.length) {
            return res.status(404).json({ message: 'Nenhuma parcela em aberto ou em atraso com data de vencimento válida encontrada.' });
        }

        // Sort the valid installments by due date to find the nearest one
        const parcelasOrdenadas = ordenarParcelasPorVencimento(parcelasValidas);

        if (!parcelasOrdenadas || parcelasOrdenadas.length === 0) {
            // This is an additional safeguard, though filtrarParcelas should handle empty valid ones.
            return res.status(404).json({ message: 'Nenhuma parcela válida encontrada após ordenação.' });
        }
        const parcelaAtual = parcelasOrdenadas[0]; // The first item is the one with the nearest due date

        // --- Response ---
        // Return the client's name and the found installment details
        return res.json({
            cliente: nome,
            parcela_atual: parcelaAtual
        });

    } catch (error) {
        // Catch-all for any other unexpected errors during the process
        console.error(`Erro inesperado na API para o cliente ${nome}:`, error);
        return res.status(500).json({ error: "Ocorreu um erro ao processar a solicitação." });
    } finally {
        // Ensure the browser context is closed after each request, whether successful or not.
        // This cleans up resources and prevents memory leaks.
        if (context) {
            try {
                await context.close();
            } catch (closeError) {
                console.error(`Error closing Playwright context for client ${nome}:`, closeError);
            }
        }
    }
});

// --- Server Port Configuration ---
const PORT = process.env.PORT || 3189; // Use port from .env or default to 3189

// --- Server and Browser Initialization Block ---
// This block ensures that the browser initialization and server startup logic
// only run when the script is executed directly (e.g., `node index.js`),
// and not when imported as a module (e.g., in tests).
if (require.main === module) {
    (async () => {
        try {
            await initializeBrowser(); // Initialize the browser first
            // Start the Express server only after successful browser initialization
            if (browser) {
                app.listen(PORT, () => {
                    console.log(`API rodando na porta ${PORT}`);
                });
            } else {
                // This case should ideally be handled by process.exit(1) in initializeBrowser
                console.error('Server not started because browser initialization failed.');
                process.exit(1);
            }
        } catch (error) { // Catch errors from initializeBrowser or app.listen
            console.error('Failed to initialize browser or start server:', error);
            if (browser) { // Attempt to close browser if it was partially initialized
                await browser.close();
            }
            process.exit(1); // Exit if server fails to start
        }
    })();
}

// --- Helper Functions for Data Processing ---

/**
 * Filters an array of installment objects.
 * It keeps only installments that:
 * 1. Have a status (case-insensitive) containing keywords for "open" or "overdue".
 * 2. Have a due date string in the format DD/MM/YYYY.
 *
 * @param {Array<Object>} parcelas - Array of installment objects. Each object should have `status` and `vencimento` properties.
 * @param {string} statusAberto - Keyword for "open" status (case-insensitive).
 * @param {string} statusAtraso - Keyword for "overdue" status (case-insensitive).
 * @returns {Array<Object>} A new array containing only the filtered installments.
 */
function filtrarParcelas(parcelas, statusAberto, statusAtraso) {
    if (!parcelas || !Array.isArray(parcelas)) {
        return []; // Return empty if input is invalid
    }
    return parcelas.filter(p => {
        // Normalize status to lowercase for case-insensitive comparison
        const currentStatus = p.status ? p.status.toLowerCase() : "";
        // Check if the current status includes the defined keywords from .env
        const hasValidStatus = currentStatus.includes(statusAberto) ||
                             currentStatus.includes(statusAtraso);

        const currentVencimento = p.vencimento || "";
        // Validate due date format using regex (DD/MM/YYYY)
        const hasValidVencimentoFormat = /^\d{2}\/\d{2}\/\d{4}$/.test(currentVencimento);

        return hasValidStatus && hasValidVencimentoFormat;
    });
}

/**
 * Sorts an array of valid installment objects by their due date.
 * The sorting is ascending (nearest due date first).
 * It handles date parsing from DD/MM/YYYY string format and attempts to correctly
 * sort dates even if some are invalid (invalid ones are pushed to the end).
 *
 * @param {Array<Object>} parcelas - Array of filtered installment objects, each with a valid `vencimento` property (DD/MM/YYYY).
 * @returns {Array<Object>} A new array containing the installments sorted by due date.
 */
function ordenarParcelasPorVencimento(parcelas) {
    if (!parcelas || !Array.isArray(parcelas) || parcelas.length === 0) {
        return []; // Return empty if input is invalid or empty
    }
    // Create a new array using spread syntax to avoid mutating the original 'parcelasValidas'
    return [...parcelas].sort((a, b) => {
        // Split DD/MM/YYYY into parts
        const partsA = a.vencimento.split('/');
        const partsB = b.vencimento.split('/');

        // Construct Date objects in YYYY-MM-DD format for reliable parsing
        // Note: Date constructor month is 0-indexed (0 for Jan, 1 for Feb, etc.)
        const dateA = new Date(`${partsA[2]}-${partsA[1]}-${partsA[0]}T00:00:00`);
        const dateB = new Date(`${partsB[2]}-${partsB[1]}-${partsB[0]}T00:00:00`);

        // Further validation: Check if the month rolled over due to an invalid day (e.g., 30/02)
        // This helps catch dates that are technically parsable by `new Date()` but are logically incorrect.
        const originalMonthA = parseInt(partsA[1], 10); // Month from input (1-indexed)
        const originalMonthB = parseInt(partsB[1], 10); // Month from input (1-indexed)

        const timeA = dateA.getTime(); // Get timestamp
        const timeB = dateB.getTime(); // Get timestamp

        // A date is considered invalid if getTime() is NaN or if the month changed during parsing
        // (e.g., "30/02/2023" might become "02/03/2023" or "01/03/2023" depending on JS engine).
        const isDateAInvalid = isNaN(timeA) || (dateA.getMonth() + 1) !== originalMonthA;
        const isDateBInvalid = isNaN(timeB) || (dateB.getMonth() + 1) !== originalMonthB;

        // Sorting logic: invalid dates go to the end
        if (isDateAInvalid && isDateBInvalid) return 0; // Both invalid, treat as equal
        if (isDateAInvalid) return 1;  // dateA is invalid, sort it after valid dateB
        if (isDateBInvalid) return -1; // dateB is invalid, sort it after valid dateA

        // Both dates are valid, sort by time
        return timeA - timeB;
    });
}

/**
 * Helper function to access the global browser instance, primarily for testing or inspection.
 * @returns {Object|null} The Playwright browser instance, or null if not initialized.
 */
function getBrowserInstance() {
    return browser;
}

// Export modules for testing purposes or if this script were to be used as a module elsewhere.
module.exports = {
    filtrarParcelas,
    ordenarParcelasPorVencimento,
    app, // Export the Express app
    initializeBrowser, // Export for testing browser initialization
    gracefulShutdown, // Potentially for testing shutdown
    getBrowserInstance // Export for inspecting browser state in tests
};
