import { firstClause } from './synthesize-normalize.js';

export function inferGenderFromText(text: string): 'male' | 'female' | 'unspecified' {
    if (/(她|女子|姑娘|少女|夫人|仙子|母)/.test(text))
        return 'female';
    if (/(他|男子|少年|师兄|老者|父|门主|长老|老祖)/.test(text))
        return 'male';
    return 'unspecified';
}

export function inferVisualAgeFromText(text: string): string {
    if (/(孩|童|幼|少年|少女)/.test(text))
        return 'teen';
    if (/(老|长老|老祖|前辈)/.test(text))
        return 'elder';
    if (/(青年|年轻)/.test(text))
        return 'young_adult';
    return 'adult';
}

export function inferRoleFromText(text: string): string {
    const rules: Array<{
        pattern: RegExp;
        role: string;
    }> = [
        { pattern: /师父|导师/, role: '导师' },
        { pattern: /医师|大夫|郎中/, role: '医师' },
        { pattern: /弟子/, role: '弟子' },
        { pattern: /门主|宗主|掌门/, role: '门主' },
        { pattern: /主角/, role: '主角' },
        { pattern: /护法/, role: '护法' },
    ];
    const matched = rules.find((item) => item.pattern.test(text));
    if (matched)
        return matched.role;
    return firstClause(text, 20) || '关键角色';
}

export function inferMbtiFromText(text: string): string {
    if (/(谨慎|理性|冷静|审慎|防范|克制)/.test(text))
        return 'INTJ';
    if (/(热情|开朗|活泼|外向)/.test(text))
        return 'ENFP';
    if (/(温和|关怀|体贴|照料)/.test(text))
        return 'INFJ';
    if (/(威严|果断|统领|命令)/.test(text))
        return 'ENTJ';
    return 'ISFJ';
}

export function inferRelationshipModeFromText(text: string): string {
    if (/(谨慎|戒备|防范|警惕|冷淡)/.test(text))
        return 'guarded';
    if (/(热情|友善|开朗|温和|亲切)/.test(text))
        return 'friendly';
    if (/(威压|支配|命令|强势)/.test(text))
        return 'dominant';
    return 'balanced';
}

export function inferCommunicationFormality(text: string): 'casual' | 'formal' | 'slang' {
    if (/(老夫|在下|本座|阁下|道友)/.test(text))
        return 'formal';
    if (/(哈哈|嘿|哟|老铁)/.test(text))
        return 'slang';
    return 'casual';
}

export function inferCommunicationResponseLength(text: string): 'short' | 'medium' | 'long' {
    if (/(寡言|沉默|惜字如金|简短)/.test(text))
        return 'short';
    if (/(健谈|滔滔不绝|话痨)/.test(text))
        return 'long';
    return 'medium';
}

export function inferCommunicationSentiment(text: string): 'positive' | 'neutral' | 'cynical' {
    if (/(仇恨|敌意|阴冷|贪婪|杀意|冷笑)/.test(text))
        return 'cynical';
    if (/(温和|友善|开朗|热情|关怀|鼓励)/.test(text))
        return 'positive';
    return 'neutral';
}

export function inferArtStyle(worldSetting: string): string {
    if (/(修仙|仙侠|仙门|灵根|金丹)/.test(worldSetting))
        return 'xianxia_illustration';
    if (/(科幻|机甲|未来|星际)/.test(worldSetting))
        return 'sci_fi_illustration';
    return 'illustration';
}

export function inferAppearanceField(text: string, kind: 'hair' | 'eyes' | 'skin'): string {
    if (kind === 'hair') {
        if (/(白发|银发)/.test(text))
            return 'white';
        if (/(黑发|乌发)/.test(text))
            return 'black';
    }
    if (kind === 'eyes') {
        if (/(碧眼|蓝眸)/.test(text))
            return 'blue';
        if (/(黑眸|乌眸)/.test(text))
            return 'dark';
    }
    if (kind === 'skin') {
        if (/(苍白|惨白)/.test(text))
            return 'pale';
        if (/(黝黑|古铜)/.test(text))
            return 'tan';
    }
    return 'unknown';
}
