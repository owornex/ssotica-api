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
        // Acessa a página de login
        await page.goto('https://app.ssotica.com.br', { waitUntil: 'domcontentloaded' });

        // Preenche login
        await page.waitForSelector('#email');
        await page.fill('#email', process.env.SSOTICA_EMAIL);

        await page.waitForSelector('#senha');
        await page.fill('#senha', process.env.SSOTICA_PASSWORD);

        await page.waitForSelector('button.button.bgBlue');
        await page.click('button.button.bgBlue');

        // Aguarda navegação após login
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

        // Vai para Contas a Receber
        await page.goto('https://app.ssotica.com.br/financeiro/contas-a-receber/LwlRRM/listar', { waitUntil: 'domcontentloaded' });

        // Preenche campo de busca
        await page.waitForSelector('input[name="searchTerm_Parcelamento"]');
        await page.fill('input[name="searchTerm_Parcelamento"]', nome);

        // Garante que o tipo de busca está como nome/apelido
        await page.selectOption('select[name="searchTermSelect_Parcelamento"]', 'nome_apelido');

        // Clica em buscar
        await page.click('button:has-text("Buscar")');

        // Aguarda carregar resultados
        await page.waitForTimeout(3000);

        // Extrai parcelas
        const parcelas = await page.$$eval('li.item-conta-a-receber', items => {
            return items.map(item => {
                const descricao = item.querySelector('.descricao-conta-a-receber')?.innerText.trim() || '';
                const venda = item.innerText.match(/Venda nº (\d+)/)?.[1] || '';
                const valor = item.querySelector('.valor-conta-a-receber')?.innerText.trim() || '';
                const vencimento = item.innerText.match(/Vencimento: (\\d{2}\\/\\d{2}\\/\\d{4})/)?.[1] || '';
                const status = item.querySelector('.status-conta-a-receber')?.innerText.trim() || '';

                return { descricao, venda, valor, vencimento, status };
            });
        });

        await browser.close();

        if (!parcelas.length) {
            return res.status(404).json({ message: 'Nenhuma parcela encontrada.' });
        }

        // Filtra parcelas que estão em aberto ou em atraso
        const parcelasFiltradas = parcelas.filter(p =>
            p.status.toLowerCase().includes('aberto') ||
            p.status.toLowerCase().includes('atraso')
        );

        if (!parcelasFiltradas.length) {
            return res.status(404).json({ message: 'Nenhuma parcela em aberto ou em atraso encontrada.' });
        }

        // Ordena pela data de vencimento (mais próxima primeiro)
        const parcelaAtual = parcelasFiltradas.sort((a, b) => {
            const dateA = new Date(a.vencimento.split('/').reverse().join('-'));
            const dateB = new Date(b.vencimento.split('/').reverse().join('-'));
            return dateA - dateB;
        })[0];

        return res.json({
            cliente: nome,
            parcela_atual: parcelaAtual
        });

    } catch (error) {
        await browser.close();
        return res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3189;
app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});
