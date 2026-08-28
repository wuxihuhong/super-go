/** Game 接口契约测试：围棋实现挂入双棋种统一套件（AGENTS.md 门禁） */
import { describe } from 'vitest';
import { gameContractTests, GoGame } from '../index.js';

describe('GoGame 契约 19 路', () => {
  gameContractTests(() => new GoGame(), { boardSize: 19 });
});

describe('GoGame 契约 13 路', () => {
  gameContractTests(() => new GoGame(), { boardSize: 13 });
});

describe('GoGame 契约 9 路', () => {
  gameContractTests(() => new GoGame(), { boardSize: 9 });
});
