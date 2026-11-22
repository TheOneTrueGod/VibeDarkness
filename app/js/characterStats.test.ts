import { describe, expect, it } from 'vitest';
import { parseStatPillToken, statPillToken, statRemindersInText } from './characterStats';
import { getResearchNode } from './researchTrees/list';
import { TRAINING_NODE_HEALTHY, TRAINING_NODE_MIGHTY, TRAINING_TREE_ID } from './researchTrees/trees/training';

describe('stat reminders', () => {
    it('explains one point of Attack with a pill: "+1 Attack = +10% damage"', () => {
        const [attack] = statRemindersInText(statPillToken('attack', '+2'));
        expect(attack.title).toBe('Attack');
        const pill = attack.reminder.match(/\{([^}]*)\}/)![1];
        expect(parseStatPillToken(pill)).toEqual({ key: 'attack', amount: '+1' });
        expect(attack.reminder).toContain('{+10%} damage');
    });

    it('skips stats without a reminder and lists each stat once', () => {
        const text = `${statPillToken('health', '+20')} and ${statPillToken('attack', '+2')} ${statPillToken('attack', '+1')}`;
        expect(statRemindersInText(text).map((r) => r.key)).toEqual(['attack']);
    });

    it('Mighty is just the Attack pill; Healthy has no reminder card', () => {
        expect(getResearchNode(TRAINING_TREE_ID, TRAINING_NODE_MIGHTY)?.description).toBe(statPillToken('attack', '+2'));
        expect(statRemindersInText(getResearchNode(TRAINING_TREE_ID, TRAINING_NODE_HEALTHY)!.description)).toEqual([]);
    });
});
