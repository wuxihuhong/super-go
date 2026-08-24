import { describe } from 'vitest';
import { gameContractTests } from '../contractTests.js';
import { MiniGo } from './miniGo.js';

// 契约套件自检：用最小合法围棋形态跑通整套断言。
// P1/P2 接入真棋种后，此处旁挂 XiangqiGame / GoGame 的同款 describe。
describe('Game 契约套件（MiniGo 3×3 自检）', () => {
  gameContractTests(() => new MiniGo());
});
