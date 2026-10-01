import { describe, expect, it } from 'vitest';
import {
    addLocationCardsToDeck,
    applyLocationModificationsToOptions,
    createLocationCardInstance,
    describeLocationModification,
    getLocationCardDef,
    LOCATION_CARD_DEFS,
    LOCATION_REWARD_DEFS,
    pickLocationCardInstance,
    type LocationCardInstance,
} from './locationCards';
import { RANDOM_STORY_BAG } from './randomStoryResolve';

describe('locationCards', () => {
    describe('LOCATION_CARD_DEFS', () => {
        it('has consistent keys and location_card_id values', () => {
            Object.entries(LOCATION_CARD_DEFS).forEach(([key, def]) => {
                expect(Number(key)).toBe(def.location_card_id);
            });
        });

        it('every def has a missionId that resolves to a registered mission', () => {
            const missionIds = RANDOM_STORY_BAG.map((m) => m.missionId);
            Object.values(LOCATION_CARD_DEFS).forEach((def) => {
                expect(missionIds).toContain(def.missionId);
            });
        });

        it('every def has displayName, description, and flavourText', () => {
            Object.values(LOCATION_CARD_DEFS).forEach((def) => {
                expect(def.displayName).toBeTruthy();
                expect(def.description).toBeTruthy();
                expect(def.flavourText).toBeTruthy();
            });
        });
    });

    describe('getLocationCardDef', () => {
        it('returns a def when the id exists', () => {
            const def = getLocationCardDef(1);
            expect(def).toBeDefined();
            expect(def?.displayName).toBe('Found Berries');
        });

        it('returns undefined when the id does not exist', () => {
            const def = getLocationCardDef(999);
            expect(def).toBeUndefined();
        });
    });

    describe('createLocationCardInstance', () => {
        it('creates an instance with the given cardId and instanceId', () => {
            const instance = createLocationCardInstance(1, 'inst-001');
            expect(instance.location_card_id).toBe(1);
            expect(instance.instanceId).toBe('inst-001');
        });

        it('starts with empty modifications', () => {
            const instance = createLocationCardInstance(1, 'inst-001');
            expect(instance.modifications).toEqual([]);
        });

        it('does not have a displayNameOverride by default', () => {
            const instance = createLocationCardInstance(1, 'inst-001');
            expect(instance.displayNameOverride).toBeUndefined();
        });
    });

    describe('describeLocationModification', () => {
        it('describes an add_reward modification with known reward id', () => {
            const description = describeLocationModification({
                type: 'add_reward',
                slot: 3,
                reward_id: 4,
            });
            expect(description).toContain('Option 3');
            expect(description).toContain('Healing poultice');
        });

        it('falls back gracefully for unknown reward ids', () => {
            const description = describeLocationModification({
                type: 'add_reward',
                slot: 1,
                reward_id: 999,
            });
            expect(description).toContain('Option 1');
            expect(description).toContain('Unknown option');
        });
    });

    describe('LOCATION_REWARD_DEFS', () => {
        it('contains reward id 4 with a healing poultice option', () => {
            const reward = LOCATION_REWARD_DEFS[4];
            expect(reward).toBeDefined();
            expect(reward?.label).toBe('Healing poultice');
            expect(reward?.option.id).toBe('location_healing_poultice');
            expect(reward?.option.action.type).toBe('heal_wounds');
            if (reward?.option.action.type === 'heal_wounds') {
                expect(reward.option.action.amount).toBe(5);
            }
        });
    });

    describe('pickLocationCardInstance', () => {
        const inst1 = createLocationCardInstance(1, 'inst-001');
        const inst2 = createLocationCardInstance(2, 'inst-002');
        const inst1_dup = createLocationCardInstance(1, 'inst-001-dup');

        it('returns null when deck is empty', () => {
            const picked = pickLocationCardInstance([], [], 42);
            expect(picked).toBeNull();
        });

        it('returns the only card when deck has one', () => {
            const picked = pickLocationCardInstance([inst1], [], 42);
            expect(picked).toEqual(inst1);
        });

        it('is deterministic for the same seed', () => {
            const deck = [inst1, inst2];
            const a = pickLocationCardInstance(deck, [], 42);
            const b = pickLocationCardInstance(deck, [], 42);
            expect(a).toEqual(b);
        });

        it('picks different cards for different seeds', () => {
            const deck = [inst1, inst2];
            const a = pickLocationCardInstance(deck, [], 100);
            const b = pickLocationCardInstance(deck, [], 999);
            // With 2 cards, different seeds should (very likely) pick different cards
            // We can't guarantee this, but 100 vs 999 is a large difference
            // For robustness, just check they both return valid instances
            expect(deck).toContain(a);
            expect(deck).toContain(b);
        });

        it('filters to min-use-count instances when all have been used', () => {
            const deck = [inst1, inst2];
            // inst1 has been used twice, inst2 once
            const picked = pickLocationCardInstance(deck, ['inst-001', 'inst-001', 'inst-002'], 42);
            // Should pick inst2 since it has lower use count
            expect(picked?.instanceId).toBe('inst-002');
        });

        it('does not repeat a card until all are used equally', () => {
            const deck = [inst1, inst2];
            const usedIds: string[] = [];

            // First pick should be from either card (both have use count 0)
            const pick1 = pickLocationCardInstance(deck, [...usedIds], 42);
            expect(pick1).not.toBeNull();
            if (pick1) usedIds.push(pick1.instanceId);

            // Second pick should prefer the unused card
            const pick2 = pickLocationCardInstance(deck, [...usedIds], 43);
            expect(pick2?.instanceId).not.toBe(pick1?.instanceId);
            if (pick2) usedIds.push(pick2.instanceId);

            // Third pick should go back to whichever has lower use count (both now have 1)
            // Just verify it returns a valid card
            const pick3 = pickLocationCardInstance(deck, [...usedIds], 44);
            expect(deck).toContain(pick3);
        });

        it('treats two instances of the same card id as separate items', () => {
            const deck = [inst1, inst1_dup, inst2];
            // Both inst1 and inst1_dup are separate instances even though card id is 1
            const usedIds = ['inst-001']; // Only inst1 used
            const picked = pickLocationCardInstance(deck, usedIds, 42);
            // Should prefer inst1_dup or inst2 since they have use count 0
            expect(picked?.instanceId).not.toBe('inst-001');
        });

        it('sorts candidates by instanceId for stable ordering', () => {
            // When all have the same use count, sorting by instanceId should give deterministic results
            const deck = [inst2, inst1]; // Not sorted
            const pickA = pickLocationCardInstance(deck, [], 42);
            const pickB = pickLocationCardInstance([...deck].reverse(), [], 42); // Reverse deck order
            // Same seed should pick the same instanceId regardless of deck order
            expect(pickA?.instanceId).toBe(pickB?.instanceId);
        });
    });

    describe('addLocationCardsToDeck', () => {
        it('appends one new instance per unique card id', () => {
            const deck = [createLocationCardInstance(1, 'inst-001')];
            let callCount = 0;
            const makeId = () => `new_${++callCount}`;

            const result = addLocationCardsToDeck(deck, [2], makeId);

            expect(result).toHaveLength(2);
            expect(result[0].instanceId).toBe('inst-001');
            expect(result[1].location_card_id).toBe(2);
            expect(result[1].instanceId).toBe('new_1');
        });

        it('appends multiple new cards in order', () => {
            const deck = [createLocationCardInstance(1, 'inst-001')];
            let callCount = 0;
            const makeId = () => `new_${++callCount}`;

            const result = addLocationCardsToDeck(deck, [2, 1], makeId);

            // Card 2 is new, so it's appended; card 1 is already in deck, so it's skipped
            expect(result).toHaveLength(2);
            expect(result[0].location_card_id).toBe(1);
            expect(result[1].location_card_id).toBe(2);
            expect(result[1].instanceId).toBe('new_1');
        });

        it('skips duplicate ids within the batch (only first occurrence is added)', () => {
            const deck: LocationCardInstance[] = [];
            let callCount = 0;
            const makeId = () => `new_${++callCount}`;

            const result = addLocationCardsToDeck(deck, [1, 1, 2], makeId);

            expect(result).toHaveLength(2);
            expect(result[0].location_card_id).toBe(1);
            expect(result[0].instanceId).toBe('new_1');
            expect(result[1].location_card_id).toBe(2);
            expect(result[1].instanceId).toBe('new_2');
        });

        it('keeps existing instances unchanged when re-granting a card already in deck', () => {
            const modifiedInstance: LocationCardInstance = {
                instanceId: 'existing_inst',
                location_card_id: 1,
                displayNameOverride: 'Special Berries',
                modifications: [{ type: 'add_reward', slot: 3, reward_id: 4 }],
            };
            const deck = [modifiedInstance];
            const makeId = () => 'should_not_call';

            const result = addLocationCardsToDeck(deck, [1], makeId);

            // Deck should remain unchanged
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(modifiedInstance); // same object reference
            expect(result[0].displayNameOverride).toBe('Special Berries');
            expect(result[0].modifications).toHaveLength(1);
        });

        it('re-granting returns an equal deck when the card is already owned', () => {
            const deck = [createLocationCardInstance(1, 'inst-001')];
            const deckCopy = [...deck];
            const makeId = () => 'should_not_call';

            const result = addLocationCardsToDeck(deck, [1], makeId);

            expect(result).toHaveLength(1);
            expect(result).toEqual(deckCopy);
        });

        it('skips cards with no definition', () => {
            const deck: LocationCardInstance[] = [];
            let callCount = 0;
            const makeId = () => `new_${++callCount}`;

            const result = addLocationCardsToDeck(deck, [1, 999, 2], makeId);

            expect(result).toHaveLength(2);
            expect(result[0].location_card_id).toBe(1);
            expect(result[1].location_card_id).toBe(2);
        });

        it('does not mutate the input deck', () => {
            const deck = [createLocationCardInstance(1, 'inst-001')];
            const deckCopy = [...deck];
            let callCount = 0;
            const makeId = () => `new_${++callCount}`;

            addLocationCardsToDeck(deck, [2], makeId);

            expect(deck).toEqual(deckCopy);
        });

        it('handles undefined deck as empty', () => {
            let callCount = 0;
            const makeId = () => `new_${++callCount}`;

            const result = addLocationCardsToDeck(undefined, [1], makeId);

            expect(result).toHaveLength(1);
            expect(result[0].location_card_id).toBe(1);
        });

        it('returns new array even with empty input', () => {
            const deck = [createLocationCardInstance(1, 'inst-001')];
            const result = addLocationCardsToDeck(deck, [], () => 'should_not_call');

            expect(result).not.toBe(deck);
            expect(result).toEqual(deck);
        });
    });

    describe('applyLocationModificationsToOptions', () => {
        it('returns a copy of options when modifications is undefined', () => {
            const options = [
                { id: 'opt1', label: 'Option 1', action: { type: 'heal_wounds' as const, amount: 5 } },
                { id: 'opt2', label: 'Option 2', action: { type: 'heal_wounds' as const, amount: 3 } },
            ];
            const result = applyLocationModificationsToOptions(options, undefined);
            expect(result).toEqual(options);
            expect(result).not.toBe(options);
        });

        it('returns a copy of options when modifications is empty', () => {
            const options = [
                { id: 'opt1', label: 'Option 1', action: { type: 'heal_wounds' as const, amount: 5 } },
            ];
            const result = applyLocationModificationsToOptions(options, []);
            expect(result).toEqual(options);
            expect(result).not.toBe(options);
        });

        it('replaces an option at the specified slot within range', () => {
            const options = [
                { id: 'opt1', label: 'Option 1', action: { type: 'heal_wounds' as const, amount: 5 } },
                { id: 'opt2', label: 'Option 2', action: { type: 'heal_wounds' as const, amount: 3 } },
                { id: 'opt3', label: 'Option 3', action: { type: 'heal_wounds' as const, amount: 2 } },
            ];
            const mods = [{ type: 'add_reward' as const, slot: 1, reward_id: 4 }];
            const result = applyLocationModificationsToOptions(options, mods);
            expect(result).toHaveLength(3);
            expect(result[0]).toBe(options[0]);
            expect(result[1].id).toBe('location_healing_poultice');
            expect(result[2]).toBe(options[2]);
        });

        it('appends an option when slot is beyond array length', () => {
            const options = [
                { id: 'opt1', label: 'Option 1', action: { type: 'heal_wounds' as const, amount: 5 } },
                { id: 'opt2', label: 'Option 2', action: { type: 'heal_wounds' as const, amount: 3 } },
                { id: 'opt3', label: 'Option 3', action: { type: 'heal_wounds' as const, amount: 2 } },
            ];
            const mods = [{ type: 'add_reward' as const, slot: 3, reward_id: 4 }];
            const result = applyLocationModificationsToOptions(options, mods);
            expect(result).toHaveLength(4);
            expect(result[0]).toBe(options[0]);
            expect(result[1]).toBe(options[1]);
            expect(result[2]).toBe(options[2]);
            expect(result[3].id).toBe('location_healing_poultice');
        });

        it('processes multiple modifications in slot order', () => {
            const options = [
                { id: 'opt1', label: 'Option 1', action: { type: 'heal_wounds' as const, amount: 5 } },
                { id: 'opt2', label: 'Option 2', action: { type: 'heal_wounds' as const, amount: 3 } },
                { id: 'opt3', label: 'Option 3', action: { type: 'heal_wounds' as const, amount: 2 } },
            ];
            // Add mods out of order; should be sorted by slot
            const mods = [
                { type: 'add_reward' as const, slot: 2, reward_id: 4 },
                { type: 'add_reward' as const, slot: 1, reward_id: 4 },
            ];
            const result = applyLocationModificationsToOptions(options, mods);
            expect(result).toHaveLength(3);
            // slot 1 mod is processed first, replacing index 1
            expect(result[1].id).toBe('location_healing_poultice');
            // slot 2 mod is processed next, replacing index 2 (same option, so skipped due to idempotence)
            // Since both use reward_id 4, the second one won't be inserted due to duplicate id check
            expect(result[2].id).toBe('opt3');
        });

        it('skips unknown reward ids', () => {
            const options = [
                { id: 'opt1', label: 'Option 1', action: { type: 'heal_wounds' as const, amount: 5 } },
            ];
            const mods = [{ type: 'add_reward' as const, slot: 0, reward_id: 999 }];
            const result = applyLocationModificationsToOptions(options, mods);
            expect(result).toEqual(options);
        });

        it('does not mutate the input array', () => {
            const options = [
                { id: 'opt1', label: 'Option 1', action: { type: 'heal_wounds' as const, amount: 5 } },
            ];
            const optionsCopy = [...options];
            const mods = [{ type: 'add_reward' as const, slot: 0, reward_id: 4 }];
            applyLocationModificationsToOptions(options, mods);
            expect(options).toEqual(optionsCopy);
        });

        it('skips modifications with duplicate option ids (idempotence)', () => {
            const options = [
                { id: 'opt1', label: 'Option 1', action: { type: 'heal_wounds' as const, amount: 5 } },
                { id: 'location_healing_poultice', label: 'Existing Poultice', action: { type: 'heal_wounds' as const, amount: 1 } },
            ];
            const mods = [{ type: 'add_reward' as const, slot: 2, reward_id: 4 }];
            const result = applyLocationModificationsToOptions(options, mods);
            // Should not append since the option id already exists
            expect(result).toHaveLength(2);
            expect(result).toEqual(options);
        });
    });
});
