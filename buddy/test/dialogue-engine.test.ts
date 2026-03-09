import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractEmotion, compileMessages, createDialogueHistory } from '../src/services/dialogue-engine.js';

describe('extractEmotion (BD-PIPE-004)', () => {
  it('extracts happy emotion tag', () => {
    const result = extractEmotion('[emotion:happy]你好呀！今天心情怎么样？');
    assert.equal(result.emotion, 'happy');
    assert.equal(result.text, '你好呀！今天心情怎么样？');
  });

  it('extracts sad emotion tag', () => {
    const result = extractEmotion('[emotion:sad]我也有点难过呢...');
    assert.equal(result.emotion, 'sad');
    assert.equal(result.text, '我也有点难过呢...');
  });

  it('extracts surprised emotion tag', () => {
    const result = extractEmotion('[emotion:surprised]哇！真的吗？太厉害了！');
    assert.equal(result.emotion, 'surprised');
    assert.equal(result.text, '哇！真的吗？太厉害了！');
  });

  it('extracts thinking emotion tag', () => {
    const result = extractEmotion('[emotion:thinking]让我想想看...');
    assert.equal(result.emotion, 'thinking');
  });

  it('extracts excited emotion tag', () => {
    const result = extractEmotion('[emotion:excited]太棒了！');
    assert.equal(result.emotion, 'excited');
  });

  it('extracts sleepy emotion tag', () => {
    const result = extractEmotion('[emotion:sleepy]好困呀...');
    assert.equal(result.emotion, 'sleepy');
  });

  it('defaults to happy when no tag (BD-PIPE-004 rule 3)', () => {
    const result = extractEmotion('没有标签的回复');
    assert.equal(result.emotion, 'happy');
    assert.equal(result.text, '没有标签的回复');
  });

  it('handles tag in middle of text', () => {
    const result = extractEmotion('前面的文字[emotion:sad]后面的文字');
    assert.equal(result.emotion, 'sad');
    assert.equal(result.text, '前面的文字后面的文字');
  });

  it('ignores invalid emotion types', () => {
    const result = extractEmotion('[emotion:angry]生气了！');
    assert.equal(result.emotion, 'happy'); // fallback
    assert.equal(result.text, '[emotion:angry]生气了！'); // not stripped
  });
});

describe('compileMessages (BD-PIPE-001)', () => {
  it('prepends system prompt', () => {
    const result = compileMessages([]);
    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'system');
    assert.ok(result[0].content.includes('儿童伙伴'));
  });

  it('includes message history', () => {
    const messages = [
      { id: 'm1', role: 'user' as const, content: '你好' },
      { id: 'm2', role: 'assistant' as const, content: '你好呀！' },
    ];
    const result = compileMessages(messages);
    assert.equal(result.length, 3); // system + 2
    assert.equal(result[1].content, '你好');
    assert.equal(result[2].content, '你好呀！');
  });

  it('trims to MAX_HISTORY_TURNS * 2', () => {
    const messages = Array.from({ length: 100 }, (_, i) => ({
      id: `m-${i}`,
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg-${i}`,
    }));
    const result = compileMessages(messages);
    // system + 40 (20 turns * 2 messages)
    assert.equal(result.length, 41);
  });

  it('keeps the system prompt in the first slot for runtime streaming adaptation', () => {
    const result = compileMessages([{ id: 'm1', role: 'user', content: '你好' }]);
    assert.equal(result[0]?.role, 'system');
    assert.equal(result[1]?.role, 'user');
  });
});

describe('DialogueHistory', () => {
  it('adds and retrieves messages', () => {
    const history = createDialogueHistory();
    history.addUser('hello');
    history.addAssistant('hi!');
    assert.equal(history.messages.length, 2);
  });

  it('trims to max turns', () => {
    const history = createDialogueHistory();
    for (let i = 0; i < 50; i++) {
      history.addUser(`user-${i}`);
      history.addAssistant(`assistant-${i}`);
    }
    assert.ok(history.messages.length <= 40); // 20 turns * 2
  });

  it('clears messages', () => {
    const history = createDialogueHistory();
    history.addUser('test');
    history.clear();
    assert.equal(history.messages.length, 0);
  });
});
