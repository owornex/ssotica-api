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
        await page.goto('https://app.ssotica.com.br/');
        await page.fill('input[name="email"]', process.env.SSOTICA_EMAIL);
        await page.fill('input[name="password"]', process.env.SSOTICA_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForNavigation();

        await page.goto('https://app.ssotica.com.br/financeiro/contas-a-receber/LwlRRM/listar');
        await page.waitForTimeout(3000);

        await page.fill('input[placeholder="Pesquise pelo nome ou apelido"]', nome);
        await page.click('button:has-text("Buscar")');
        await page.waitForTimeout(3000);

        const parcelas = await page.$$eval('.panel', cards => {
            return cards.map(card => {
                const nomeCliente = card.querySelector('strong')?.innerText.trim();
                const venda = card.innerText.match(/Venda nº (\d+)/)?.[1] || '';
                const valor = card.innerText.match(/R\$ [\d.,]+/)?.[0] || '';
                const vencimento = card.innerText.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || '';
                const status = card.querySelector('.label')?.innerText.trim() || '';
                const descricao = (card.innerText.match(/Parcela .*$/) || [])[0] || '';

                return { nomeCliente, venda, valor, vencimento, status, descricao };
            });
        });

        await browser.close();

        if (parcelas.length === 0) {
            return res.status(404).json({ message: 'Nenhuma parcela encontrada.' });
        }

        res.json({
            cliente: nome,
            parcelas
        });

    } catch (error) {
        await browser.close();
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3189;
app.listen(PORT, () => {
    console.log(`API rodando na porta ${PORT}`);
});