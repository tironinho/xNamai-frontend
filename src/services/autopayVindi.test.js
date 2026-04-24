// Testes unitários para detectBrandCode
// Execute com: npm test

import { detectBrandCode } from './autopayVindi';

describe('detectBrandCode', () => {
  describe('Visa', () => {
    it('deve detectar Visa começando com 4', () => {
      expect(detectBrandCode('4111111111111111')).toBe('visa');
      expect(detectBrandCode('4000 0000 0000 0002')).toBe('visa');
      expect(detectBrandCode('4242424242424242')).toBe('visa');
    });
  });

  describe('Mastercard', () => {
    it('deve detectar Mastercard 51-55', () => {
      expect(detectBrandCode('5111111111111111')).toBe('mastercard');
      expect(detectBrandCode('5555555555554444')).toBe('mastercard');
    });

    it('deve detectar Mastercard range 2221-2720', () => {
      expect(detectBrandCode('2221000000000000')).toBe('mastercard');
      expect(detectBrandCode('2720000000000000')).toBe('mastercard');
      expect(detectBrandCode('2500000000000000')).toBe('mastercard');
    });
  });

  describe('American Express', () => {
    it('deve detectar Amex começando com 34', () => {
      expect(detectBrandCode('341111111111111')).toBe('american_express');
      expect(detectBrandCode('349999999999999')).toBe('american_express');
    });

    it('deve detectar Amex começando com 37', () => {
      expect(detectBrandCode('371111111111111')).toBe('american_express');
      expect(detectBrandCode('378282246310005')).toBe('american_express');
    });
  });

  describe('Diners Club', () => {
    it('deve detectar Diners 300-305', () => {
      expect(detectBrandCode('30000000000004')).toBe('diners_club');
      expect(detectBrandCode('30500000000004')).toBe('diners_club');
    });

    it('deve detectar Diners começando com 36', () => {
      expect(detectBrandCode('36000000000008')).toBe('diners_club');
      expect(detectBrandCode('36999999999999')).toBe('diners_club');
    });

    it('deve detectar Diners começando com 38', () => {
      expect(detectBrandCode('38000000000006')).toBe('diners_club');
    });
  });

  describe('Elo', () => {
    it('deve detectar Elo com BIN 6504', () => {
      expect(detectBrandCode('6504000000000000')).toBe('elo');
    });

    it('deve detectar Elo com BIN 636368', () => {
      expect(detectBrandCode('6363680000000000')).toBe('elo');
    });

    it('deve detectar Elo com BIN 636369', () => {
      expect(detectBrandCode('6363690000000000')).toBe('elo');
    });

    it('deve detectar Elo com BIN 6516', () => {
      expect(detectBrandCode('6516000000000000')).toBe('elo');
    });

    it('deve detectar Elo com BIN 6550', () => {
      expect(detectBrandCode('6550000000000000')).toBe('elo');
    });

    it('deve detectar Elo com range 5090-5099', () => {
      expect(detectBrandCode('5090000000000000')).toBe('elo');
      expect(detectBrandCode('5099000000000000')).toBe('elo');
    });
  });

  describe('Hipercard', () => {
    it('deve detectar Hipercard com BIN 606282', () => {
      expect(detectBrandCode('6062820000000000')).toBe('hipercard');
    });

    it('deve detectar Hipercard com range 384100-384199', () => {
      expect(detectBrandCode('3841000000000000')).toBe('hipercard');
      expect(detectBrandCode('3841990000000000')).toBe('hipercard');
    });
  });

  describe('Casos de borda', () => {
    it('deve retornar null para número muito curto', () => {
      expect(detectBrandCode('12345')).toBe(null);
      expect(detectBrandCode('')).toBe(null);
    });

    it('deve retornar null para número não reconhecido', () => {
      expect(detectBrandCode('1234567890123456')).toBe(null);
    });

    it('deve normalizar entrada com espaços e hífens', () => {
      expect(detectBrandCode('4111 1111 1111 1111')).toBe('visa');
      expect(detectBrandCode('4111-1111-1111-1111')).toBe('visa');
    });

    it('deve priorizar Elo sobre Visa para BINs que começam com 4 mas são Elo', () => {
      // Elo com BIN 401178 deve ser detectado antes de Visa
      expect(detectBrandCode('4011780000000000')).toBe('elo');
    });
  });
});

