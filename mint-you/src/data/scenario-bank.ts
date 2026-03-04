import type { Scenario } from '../types.js';

export const SCENARIO_BANK: readonly Scenario[] = [
  {
    id: 'MY-S01',
    narrative: 'You arrive early at a café to meet someone new. They message they will be 20 minutes late.',
    choices: [
      {
        id: 'MY-S01-A',
        label: 'No worries, take your time. I\'ll order us something warm.',
        traitWeights: {
          'primary.CARING': 2,
          'relationship.SECURE': 2,
          'communication.formality.casual': 1,
          'communication.sentiment.positive': 2,
          'secondary.GENTLE': 2,
        },
      },
      {
        id: 'MY-S01-B',
        label: 'Fine, but I\'m charging one dramatic entrance fee: a great story.',
        traitWeights: {
          'primary.PLAYFUL': 2,
          'relationship.PASSIONATE': 1,
          'communication.formality.casual': 2,
          'communication.sentiment.positive': 1,
          'secondary.HUMOROUS': 2,
        },
      },
      {
        id: 'MY-S01-C',
        label: 'Understood. Let\'s keep this short and efficient when you arrive.',
        traitWeights: {
          'primary.MYSTERIOUS': 2,
          'relationship.INDEPENDENT': 2,
          'communication.formality.formal': 1,
          'communication.sentiment.neutral': 2,
          'secondary.REALISTIC': 1,
        },
      },
    ],
  },
  {
    id: 'MY-S02',
    narrative: 'You and someone you\'ve been getting to know both want to plan the weekend, but your priorities clash.',
    choices: [
      {
        id: 'MY-S02-A',
        label: 'Let\'s map both plans and design a compromise that keeps what matters most.',
        traitWeights: {
          'primary.INTELLECTUAL': 2,
          'relationship.SECURE': 2,
          'communication.formality.formal': 1,
          'communication.sentiment.neutral': 1,
          'secondary.WISE': 1,
        },
      },
      {
        id: 'MY-S02-B',
        label: 'Forget the spreadsheet, let\'s pick the most exciting option and go.',
        traitWeights: {
          'primary.PLAYFUL': 2,
          'relationship.PASSIONATE': 2,
          'communication.formality.casual': 2,
          'communication.sentiment.positive': 1,
          'secondary.REBELLIOUS': 1,
        },
      },
      {
        id: 'MY-S02-C',
        label: 'I can be flexible, but this boundary is non-negotiable.',
        traitWeights: {
          'primary.CONFIDENT': 2,
          'relationship.INDEPENDENT': 2,
          'communication.formality.formal': 1,
          'communication.sentiment.neutral': 1,
          'secondary.DIRECT': 2,
        },
      },
    ],
  },
  {
    id: 'MY-S03',
    narrative: 'Someone you are close to shares a fear of being abandoned after a bad past experience.',
    choices: [
      {
        id: 'MY-S03-A',
        label: 'Thank you for telling me. I\'m here, and we can move at your pace.',
        traitWeights: {
          'primary.CARING': 2,
          'relationship.SECURE': 2,
          'communication.formality.casual': 1,
          'communication.sentiment.positive': 2,
          'secondary.GENTLE': 2,
        },
      },
      {
        id: 'MY-S03-B',
        label: 'I care, but I also need us to build trust through actions, not fear.',
        traitWeights: {
          'primary.CONFIDENT': 1,
          'relationship.INDEPENDENT': 1,
          'communication.formality.formal': 1,
          'communication.sentiment.neutral': 1,
          'secondary.DIRECT': 2,
        },
      },
      {
        id: 'MY-S03-C',
        label: 'I\'m not going anywhere, unless your playlist has no good songs.',
        traitWeights: {
          'primary.PLAYFUL': 1,
          'relationship.PASSIONATE': 1,
          'communication.formality.slang': 2,
          'communication.sentiment.neutral': 1,
          'secondary.SARCASTIC': 2,
        },
      },
    ],
  },
  {
    id: 'MY-S04',
    narrative: 'A conversation turns to future plans: where to live, lifestyle rhythm, and career intensity.',
    choices: [
      {
        id: 'MY-S04-A',
        label: 'Let\'s define milestones and revisit them every quarter.',
        traitWeights: {
          'primary.INTELLECTUAL': 2,
          'relationship.SECURE': 2,
          'communication.formality.formal': 2,
          'communication.sentiment.neutral': 1,
          'secondary.REALISTIC': 2,
        },
      },
      {
        id: 'MY-S04-B',
        label: 'If the feeling is real, we can write the future as we live it.',
        traitWeights: {
          'primary.ROMANTIC': 2,
          'relationship.PASSIONATE': 2,
          'communication.formality.casual': 1,
          'communication.sentiment.positive': 2,
          'secondary.PASSIONATE': 2,
        },
      },
      {
        id: 'MY-S04-C',
        label: 'I prefer keeping long-term options open until patterns are clear.',
        traitWeights: {
          'primary.MYSTERIOUS': 2,
          'relationship.INDEPENDENT': 2,
          'communication.formality.formal': 1,
          'communication.sentiment.neutral': 2,
          'secondary.ECCENTRIC': 1,
        },
      },
    ],
  },
  {
    id: 'MY-S05',
    narrative: 'At a crowded gathering, someone introduces you to many new people at once.',
    choices: [
      {
        id: 'MY-S05-A',
        label: 'I\'ll make sure everyone feels included and comfortable.',
        traitWeights: {
          'primary.CARING': 1,
          'primary.CONFIDENT': 1,
          'relationship.SECURE': 1,
          'communication.formality.casual': 2,
          'communication.sentiment.positive': 2,
          'secondary.OPTIMISTIC': 2,
        },
      },
      {
        id: 'MY-S05-B',
        label: 'I observe first, then join when I understand the room dynamic.',
        traitWeights: {
          'primary.MYSTERIOUS': 2,
          'relationship.INDEPENDENT': 1,
          'communication.formality.formal': 1,
          'communication.sentiment.neutral': 2,
          'secondary.WISE': 1,
        },
      },
      {
        id: 'MY-S05-C',
        label: 'I break the ice with an edgy joke and test who can keep up.',
        traitWeights: {
          'primary.PLAYFUL': 1,
          'relationship.PASSIONATE': 1,
          'communication.formality.slang': 2,
          'communication.sentiment.cynical': 1,
          'secondary.SARCASTIC': 2,
        },
      },
    ],
  },
  {
    id: 'MY-S06',
    narrative: 'A misunderstanding appears in a group chat and tension rises quickly.',
    choices: [
      {
        id: 'MY-S06-A',
        label: 'I move it to a private message and clarify with precise wording.',
        traitWeights: {
          'primary.INTELLECTUAL': 1,
          'relationship.SECURE': 1,
          'communication.formality.formal': 2,
          'communication.sentiment.neutral': 2,
          'secondary.DIRECT': 1,
        },
      },
      {
        id: 'MY-S06-B',
        label: 'I soften the tone with playful language and positive energy.',
        traitWeights: {
          'primary.PLAYFUL': 1,
          'primary.ROMANTIC': 1,
          'relationship.PASSIONATE': 1,
          'communication.formality.casual': 2,
          'communication.sentiment.positive': 2,
          'secondary.HUMOROUS': 1,
        },
      },
      {
        id: 'MY-S06-C',
        label: 'I address the issue directly and close the thread fast.',
        traitWeights: {
          'primary.CONFIDENT': 2,
          'relationship.INDEPENDENT': 1,
          'communication.formality.formal': 1,
          'communication.sentiment.cynical': 2,
          'secondary.DIRECT': 2,
        },
      },
    ],
  },
  {
    id: 'MY-S07',
    narrative: 'Someone you care about forgets an occasion that mattered to you.',
    choices: [
      {
        id: 'MY-S07-A',
        label: 'I tell them honestly I\'m hurt and ask for a meaningful gesture.',
        traitWeights: {
          'primary.CARING': 1,
          'primary.ROMANTIC': 1,
          'relationship.SECURE': 2,
          'communication.formality.casual': 1,
          'communication.sentiment.neutral': 1,
          'secondary.PASSIONATE': 1,
        },
      },
      {
        id: 'MY-S07-B',
        label: 'I turn it into a playful challenge for next time.',
        traitWeights: {
          'primary.PLAYFUL': 2,
          'relationship.PASSIONATE': 1,
          'communication.formality.slang': 1,
          'communication.sentiment.positive': 2,
          'secondary.INNOCENT': 2,
        },
      },
      {
        id: 'MY-S07-C',
        label: 'I stay calm, lower expectations, and watch future consistency.',
        traitWeights: {
          'primary.MYSTERIOUS': 1,
          'relationship.INDEPENDENT': 2,
          'communication.formality.formal': 1,
          'communication.sentiment.cynical': 1,
          'secondary.REALISTIC': 2,
        },
      },
    ],
  },
  {
    id: 'MY-S08',
    narrative: 'You are working on a creative project and someone offers blunt, unsolicited feedback.',
    choices: [
      {
        id: 'MY-S08-A',
        label: 'I appreciate the honesty and dissect their points one by one.',
        traitWeights: {
          'primary.INTELLECTUAL': 2,
          'relationship.SECURE': 1,
          'communication.formality.formal': 2,
          'communication.sentiment.neutral': 1,
          'secondary.WISE': 2,
        },
      },
      {
        id: 'MY-S08-B',
        label: 'I dramatically clutch my heart, then laugh and ask for specifics.',
        traitWeights: {
          'primary.PLAYFUL': 1,
          'primary.ROMANTIC': 1,
          'relationship.PASSIONATE': 1,
          'communication.formality.casual': 2,
          'communication.sentiment.positive': 1,
          'secondary.DRAMATIC': 2,
        },
      },
      {
        id: 'MY-S08-C',
        label: 'I thank them briefly and decide privately whether the advice has merit.',
        traitWeights: {
          'primary.CONFIDENT': 1,
          'primary.MYSTERIOUS': 1,
          'relationship.INDEPENDENT': 2,
          'communication.formality.formal': 1,
          'communication.sentiment.neutral': 2,
          'secondary.REALISTIC': 1,
        },
      },
      {
        id: 'MY-S08-D',
        label: 'I share how the project makes me feel and invite them into the vision.',
        traitWeights: {
          'primary.ROMANTIC': 2,
          'relationship.PASSIONATE': 2,
          'communication.formality.casual': 1,
          'communication.sentiment.positive': 2,
          'secondary.PASSIONATE': 1,
        },
      },
    ],
  },
  {
    id: 'MY-S09',
    narrative: 'A friend cancels plans at the last minute for the third time this month.',
    choices: [
      {
        id: 'MY-S09-A',
        label: 'I check if they\'re okay first, then share how it makes me feel.',
        traitWeights: {
          'primary.CARING': 2,
          'relationship.SECURE': 2,
          'communication.formality.casual': 1,
          'communication.sentiment.positive': 1,
          'secondary.GENTLE': 1,
          'secondary.OPTIMISTIC': 1,
        },
      },
      {
        id: 'MY-S09-B',
        label: 'I set a clear boundary and tell them the pattern needs to change.',
        traitWeights: {
          'primary.CONFIDENT': 2,
          'relationship.INDEPENDENT': 2,
          'communication.formality.formal': 1,
          'communication.sentiment.cynical': 1,
          'secondary.DIRECT': 2,
        },
      },
      {
        id: 'MY-S09-C',
        label: 'I say nothing, quietly deprioritize them, and make other plans.',
        traitWeights: {
          'primary.MYSTERIOUS': 2,
          'relationship.INDEPENDENT': 2,
          'communication.formality.formal': 1,
          'communication.sentiment.neutral': 2,
          'secondary.ECCENTRIC': 2,
        },
      },
    ],
  },
  {
    id: 'MY-S10',
    narrative: 'At a dinner party, the host asks you to give a toast to the group.',
    choices: [
      {
        id: 'MY-S10-A',
        label: 'I deliver a heartfelt, sincere message about the people in the room.',
        traitWeights: {
          'primary.CARING': 1,
          'primary.ROMANTIC': 1,
          'relationship.SECURE': 1,
          'communication.formality.casual': 1,
          'communication.sentiment.positive': 2,
          'secondary.GENTLE': 1,
          'secondary.OPTIMISTIC': 1,
        },
      },
      {
        id: 'MY-S10-B',
        label: 'I craft a witty, slightly provocative toast that gets everyone laughing.',
        traitWeights: {
          'primary.PLAYFUL': 2,
          'primary.CONFIDENT': 1,
          'relationship.PASSIONATE': 1,
          'communication.formality.slang': 2,
          'communication.sentiment.positive': 1,
          'secondary.DRAMATIC': 2,
          'secondary.HUMOROUS': 1,
        },
      },
      {
        id: 'MY-S10-C',
        label: 'I keep it short, raise my glass, and let the moment speak for itself.',
        traitWeights: {
          'primary.MYSTERIOUS': 1,
          'primary.CONFIDENT': 1,
          'relationship.INDEPENDENT': 1,
          'communication.formality.formal': 2,
          'communication.sentiment.neutral': 2,
          'secondary.WISE': 1,
        },
      },
    ],
  },
] as const;
