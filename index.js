require('dotenv').config();
const { chromium } = require('playwright');
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/consultar', async (req, res) => {
    const { nome } = req.body;
    if (!nome) {
        return res.status(400).json({ error: 'Nome do cliente é obrigatório' });
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
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
            console.error(`Login error for client "${nome}":`, loginError);
            await browser.close();
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
            console.error(`Navigation or data fetching error for client "${nome}":`, navigationError);
            await browser.close();
            return res.status(500).json({ error: "Falha ao navegar ou buscar dados no sistema externo." });
        }

        // Close the browser instance as it's no longer needed for this request
        await browser.close();

        // If no installments were found at all for the client
        if (!parcelas.length) {
            return res.status(404).json({ message: 'Nenhuma parcela encontrada.' });
        }

        // --- Data Processing: Filtering and Sorting ---
        // Filter installments to include only those with relevant status (e.g., "open", "overdue")
        // and a valid due date format (DD/MM/YYYY).
        const parcelasValidas = parcelas.filter(p => {
            const hasValidStatus = p.status.toLowerCase().includes(statusAberto) ||
                                 p.status.toLowerCase().includes(statusAtraso);
            const hasValidVencimentoFormat = /^\d{2}\/\d{2}\/\d{4}$/.test(p.vencimento);
            return hasValidStatus && hasValidVencimentoFormat;
        });

        // If no installments remain after filtering
        if (!parcelasValidas.length) {
            return res.status(404).json({ message: 'Nenhuma parcela em aberto ou em atraso com data de vencimento válida encontrada.' });
        }

        // Sort valid installments by due date, from nearest to furthest.
        // Installments with invalid dates (that might have unexpectedly passed the format check) are moved to the end.
        const parcelaAtual = parcelasValidas.sort((a, b) => {
            // Convert DD/MM/YYYY to YYYY-MM-DD for Date parsing
            const dateA = new Date(a.vencimento.split('/').reverse().join('-'));
            const dateB = new Date(b.vencimento.split('/').reverse().join('-'));

            const timeA = dateA.getTime();
            const timeB = dateB.getTime();

            // Handle cases where date parsing might result in an invalid Date object
            if (isNaN(timeA) && isNaN(timeB)) return 0; // If both are invalid, treat as equal
            if (isNaN(timeA)) return 1;  // Push invalid dateA towards the end
            if (isNaN(timeB)) return -1; // Push invalid dateB towards the end

            return timeA - timeB; // Ascending order (earliest date first)
        })[0];

        return res.json({
            cliente: nome,
            parcela_atual: parcelaAtual
        });

    } catch (error) {
        console.error(`Error processing request for client "${nome}":`, error); // Detailed server-side logging
        await browser.close();
        return res.status(500).json({ error: "Ocorreu um erro ao processar a solicitação." }); // Generic message for client
    }
});

const PORT = process.env.PORT || 3189;
app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});
