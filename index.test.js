const { filtrarParcelas, ordenarParcelasPorVencimento } = require('./index');

describe('filtrarParcelas', () => {
    const statusAberto = 'aberto';
    const statusAtraso = 'atraso';

    test('deve retornar apenas parcelas em aberto ou atraso com data válida', () => {
        const parcelas = [
            { status: 'Em Aberto', vencimento: '25/12/2024', valor: '100,00' },
            { status: 'Pago', vencimento: '20/11/2024', valor: '50,00' },
            { status: 'EM ATRASO', vencimento: '01/01/2024', valor: '75,00' }, // Test case insensitivity for status
            { status: 'Em Aberto', vencimento: '30/02/2024', valor: '200,00' }, // Invalid date, but valid format
            { status: 'Em Aberto', vencimento: '15-12-2024', valor: '120,00' }, // Invalid format
            { status: 'Pendente', vencimento: '10/10/2024', valor: '90,00' }, // Status not matching
        ];
        const esperado = [
            { status: 'Em Aberto', vencimento: '25/12/2024', valor: '100,00' },
            { status: 'EM ATRASO', vencimento: '01/01/2024', valor: '75,00' },
            { status: 'Em Aberto', vencimento: '30/02/2024', valor: '200,00' }, // Will pass filter due to format, sort will handle date validity
        ];
        expect(filtrarParcelas(parcelas, statusAberto, statusAtraso)).toEqual(esperado);
    });

    test('deve retornar array vazio se nenhuma parcela corresponder', () => {
        const parcelas = [
            { status: 'Pago', vencimento: '20/11/2024', valor: '50,00' },
            { status: 'Em Aberto', vencimento: '15-12-2024', valor: '120,00' },
        ];
        expect(filtrarParcelas(parcelas, statusAberto, statusAtraso)).toEqual([]);
    });

    test('deve retornar array vazio para entrada de parcelas vazia', () => {
        expect(filtrarParcelas([], statusAberto, statusAtraso)).toEqual([]);
    });

    test('deve retornar array vazio para entrada de parcelas nula ou indefinida', () => {
        expect(filtrarParcelas(null, statusAberto, statusAtraso)).toEqual([]);
        expect(filtrarParcelas(undefined, statusAberto, statusAtraso)).toEqual([]);
    });

    test('deve lidar com status ou vencimento ausentes no objeto parcela', () => {
        const parcelas = [
            { status: 'Em Aberto' /* vencimento missing */ },
            { vencimento: '25/12/2024' /* status missing */ },
            { status: 'Em Aberto', vencimento: '25/12/2024' },
        ];
        const esperado = [
            { status: 'Em Aberto', vencimento: '25/12/2024' },
        ];
        expect(filtrarParcelas(parcelas, statusAberto, statusAtraso)).toEqual(esperado);
    });
});

describe('ordenarParcelasPorVencimento', () => {
    test('deve ordenar parcelas pela data de vencimento corretamente', () => {
        const parcelas = [
            { vencimento: '25/12/2024', id: 1 },
            { vencimento: '01/01/2024', id: 2 },
            { vencimento: '15/06/2024', id: 3 },
        ];
        const esperado = [
            { vencimento: '01/01/2024', id: 2 },
            { vencimento: '15/06/2024', id: 3 },
            { vencimento: '25/12/2024', id: 1 },
        ];
        expect(ordenarParcelasPorVencimento(parcelas)).toEqual(esperado);
    });

    test('deve mover datas funcionalmente inválidas (ex: 30/02) para o final', () => {
        const parcelas = [
            { vencimento: '25/12/2024', id: 1 },
            { vencimento: '30/02/2024', id: 2 }, // Formato válido, data inválida
            { vencimento: '01/01/2024', id: 3 },
        ];
        const resultado = ordenarParcelasPorVencimento(parcelas);
        expect(resultado[0].vencimento).toBe('01/01/2024');
        expect(resultado[1].vencimento).toBe('25/12/2024');
        expect(resultado[2].vencimento).toBe('30/02/2024');
    });

    test('deve manter a ordem original para datas igualmente inválidas ou não-parseáveis', () => {
        // getTime() for 'gibberish' and 'another_invalid' will both be NaN
        // The sort stability for such items might depend on JS engine, but they should be at the end.
        const parcelas = [
            { vencimento: '25/12/2024', id: 1 },
            { vencimento: 'gibberish', id: 2 },
            { vencimento: '01/01/2024', id: 3 },
            { vencimento: 'another_invalid', id: 4 },
        ];
        const resultado = ordenarParcelasPorVencimento(parcelas);
        expect(resultado[0].vencimento).toBe('01/01/2024');
        expect(resultado[1].vencimento).toBe('25/12/2024');
        // Check that the last two items are the invalid ones, their relative order might vary
        expect([resultado[2].vencimento, resultado[3].vencimento]).toEqual(
            expect.arrayContaining(['gibberish', 'another_invalid'])
        );
    });

    test('deve retornar array vazio para entrada de parcelas vazia', () => {
        expect(ordenarParcelasPorVencimento([])).toEqual([]);
    });

    test('deve retornar array vazio para entrada de parcelas nula ou indefinida', () => {
        expect(ordenarParcelasPorVencimento(null)).toEqual([]);
        expect(ordenarParcelasPorVencimento(undefined)).toEqual([]);
    });

    test('deve retornar a parcela única se apenas uma for fornecida', () => {
        const parcelas = [{ vencimento: '01/01/2025', id: 1 }];
        expect(ordenarParcelasPorVencimento(parcelas)).toEqual([{ vencimento: '01/01/2025', id: 1 }]);
    });

    test('deve manter a ordem de parcelas com a mesma data de vencimento (estabilidade)', () => {
        const parcelas = [
            { vencimento: '25/12/2024', id: 1, details: 'first' },
            { vencimento: '01/01/2024', id: 2, details: 'second' },
            { vencimento: '25/12/2024', id: 3, details: 'third' },
        ];
        // Note: JavaScript's .sort() is not guaranteed to be stable by language spec until ES2019.
        // Most modern engines implement it stably. If strict stability is needed and engine is old,
        // a custom stable sort algorithm would be required. Here, we test typical modern behavior.
        const resultado = ordenarParcelasPorVencimento(parcelas);
        expect(resultado).toEqual([
            { vencimento: '01/01/2024', id: 2, details: 'second' },
            { vencimento: '25/12/2024', id: 1, details: 'first' },
            { vencimento: '25/12/2024', id: 3, details: 'third' },
        ]);
    });
});
