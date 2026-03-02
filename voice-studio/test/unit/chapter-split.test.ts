import { describe, it, expect } from 'vitest';
import { splitTextIntoChapters, computeTextStats } from '../../src/services/chapter-splitter.js';

describe('splitTextIntoChapters', () => {
  it('returns empty array for empty text', () => {
    expect(splitTextIntoChapters('')).toEqual([]);
    expect(splitTextIntoChapters('   ')).toEqual([]);
  });

  it('returns single chapter when no heading patterns found', () => {
    const text = '这是一段没有章节标题的文本，只是普通的叙述内容。';
    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe('全文');
    expect(chapters[0]!.rawText).toBe(text);
    expect(chapters[0]!.index).toBe(0);
  });

  it('splits Chinese chapter headings (第X章)', () => {
    const text = `第一章 初始
这是第一章的内容。

第二章 发展
这是第二章的内容。

第三章 结局
这是第三章的内容。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(3);
    expect(chapters[0]!.title).toBe('第一章 初始');
    expect(chapters[0]!.index).toBe(0);
    expect(chapters[1]!.title).toBe('第二章 发展');
    expect(chapters[1]!.index).toBe(1);
    expect(chapters[2]!.title).toBe('第三章 结局');
    expect(chapters[2]!.index).toBe(2);
  });

  it('splits Chinese headings with numeric digits (第1章)', () => {
    const text = `第1章 开始
内容一。

第2章 中间
内容二。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('第1章 开始');
    expect(chapters[1]!.title).toBe('第2章 中间');
  });

  it('splits English Chapter headings', () => {
    const text = `Chapter 1 The Beginning
Once upon a time...

Chapter 2 The Journey
They set out on a long road...

Chapter 3 The End
And so it concluded.`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(3);
    expect(chapters[0]!.title).toBe('Chapter 1 The Beginning');
    expect(chapters[1]!.title).toBe('Chapter 2 The Journey');
    expect(chapters[2]!.title).toBe('Chapter 3 The End');
  });

  it('splits CHAPTER with Roman numerals', () => {
    const text = `CHAPTER I
First chapter content.

CHAPTER II
Second chapter content.

CHAPTER III
Third chapter content.`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(3);
    expect(chapters[0]!.title).toBe('CHAPTER I');
    expect(chapters[2]!.title).toBe('CHAPTER III');
  });

  it('includes prelude text before first chapter heading', () => {
    const text = `这是一段序言文字。

第一章 正文开始
这是正文内容。

第二章 继续
更多内容。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(3);
    expect(chapters[0]!.title).toBe('前言');
    expect(chapters[0]!.rawText).toBe('这是一段序言文字。');
    expect(chapters[1]!.title).toBe('第一章 正文开始');
    expect(chapters[2]!.title).toBe('第二章 继续');
  });

  it('handles Chinese 节/回/卷/篇 variants', () => {
    const text = `第一回 风起
内容一。

第二回 云涌
内容二。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('第一回 风起');
    expect(chapters[1]!.title).toBe('第二回 云涌');
  });

  it('handles large text with many chapters', () => {
    const chapterTexts = Array.from({ length: 50 }, (_, i) =>
      `第${i + 1}章 标题${i + 1}\n${'这是一段重复的文本内容。'.repeat(100)}`
    );
    const text = chapterTexts.join('\n\n');

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(50);
    expect(chapters[49]!.index).toBe(49);
  });

  it('splits numeric dot headings (1.标题 format)', () => {
    const text = `《三体》
作者：刘慈欣

前言

一些前言内容。

1.疯狂年代

中国，1967年。大楼的攻击已持续了两天。

2.寂静的春天

叶文洁走进了红岸基地。

3.红岸之一

红岸工程的设施出现在眼前。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(4); // prelude + 3 chapters
    expect(chapters[0]!.title).toBe('前言');
    expect(chapters[1]!.title).toBe('1.疯狂年代');
    expect(chapters[2]!.title).toBe('2.寂静的春天');
    expect(chapters[3]!.title).toBe('3.红岸之一');
  });

  it('splits numeric dot headings with fullwidth dot (1．标题)', () => {
    const text = `1．开篇
内容一。

2．发展
内容二。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('1．开篇');
    expect(chapters[1]!.title).toBe('2．发展');
  });

  it('splits numeric headings with Chinese enumeration dot (1、标题)', () => {
    const text = `1、序章
内容一。

2、主线
内容二。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('1、序章');
    expect(chapters[1]!.title).toBe('2、主线');
  });

  it('splits single heading with substantial prelude into 2 chapters', () => {
    const text = `《三体：地球往事》
作者：刘慈欣

前言

这是一段很长的前言文字，包含了作者对这本书的介绍和背景说明。这段文字足够长，超过了五十个字符的阈值。

1.疯狂年代

中国，1967年。大楼的攻击已持续了两天。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toBe('前言');
    expect(chapters[1]!.title).toBe('1.疯狂年代');
  });

  it('does not split single heading with trivial prelude', () => {
    const text = `标题

1.第一章

这是第一章的内容。`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe('全文');
  });

  it('correctly assigns sequential indices with prelude', () => {
    const text = `前置内容

第一章 A
内容A

第二章 B
内容B`;

    const chapters = splitTextIntoChapters(text);
    expect(chapters.map((c) => c.index)).toEqual([0, 1, 2]);
  });
});

describe('computeTextStats', () => {
  it('returns zero stats for empty chapters', () => {
    const stats = computeTextStats([]);
    expect(stats.totalChars).toBe(0);
    expect(stats.totalChapters).toBe(0);
    expect(stats.chapterStats).toEqual([]);
  });

  it('computes correct stats for multiple chapters', () => {
    const chapters = [
      { index: 0, title: '第一章', rawText: '你好世界' },
      { index: 1, title: '第二章', rawText: 'Hello World' },
    ];
    const stats = computeTextStats(chapters);
    expect(stats.totalChars).toBe(15); // 4 + 11
    expect(stats.totalChapters).toBe(2);
    expect(stats.chapterStats[0]!.charCount).toBe(4);
    expect(stats.chapterStats[1]!.charCount).toBe(11);
  });
});
