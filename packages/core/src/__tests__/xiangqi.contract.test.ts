/** Game 接口契约测试：象棋实现挂入双棋种统一套件（AGENTS.md 门禁） */
import { describe } from 'vitest';
import { gameContractTests, XiangqiGame } from '../index.js';

describe('XiangqiGame 契约', () => {
  gameContractTests(() => new XiangqiGame());
});
