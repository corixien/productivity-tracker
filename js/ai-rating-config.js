const aiRatingConfig = {
    rules: [
        'XP scoring system for productivity tasks. The AI must ALWAYS use the user\'s 5-year goals first.',
        'If the user\'s goals do not provide enough information, the AI must fall back to the examples below.',
        'If productivity = 0, XP MUST be 0.'
    ],

    goalPriority: {
        description: 'User-provided 5-year goals override all examples. Examples are only used as backup when the user\'s goals do not define how to treat a task category.',
        example: 'If the user writes "I want to become a professional gamer", gaming tasks may receive XP. If the user does NOT mention gaming as a goal, gaming tasks MUST receive 0 XP.'
    },

    productivity: {
        description: 'How much does the task contribute to the user\'s long-term goals?',
        scale: {
            0: 'No benefit at all (Example: watching TikTok)',
            1: 'Very small benefit (Example: light stretching for 2 minutes)',
            2: 'Small benefit (Example: cleaning your desk quickly)',
            3: 'Medium benefit (Example: reading a book for 20 minutes)',
            4: 'High benefit (Example: practicing an instrument for 30 minutes)',
            5: 'Very high benefit (Example: studying math or coding for 1 hour)'
        }
    },

    difficulty: {
        description: 'How hard was the task mentally or physically?',
        scale: {
            1: 'Very easy (Example: wiping a table)',
            2: 'Easy (Example: light jogging)',
            3: 'Medium (Example: practicing piano with focus)',
            4: 'Hard (Example: solving math problems)',
            5: 'Very hard (Example: learning advanced programming concepts)'
        }
    },

    offlineBonus: {
        description: 'Bonus for offline or social tasks.',
        values: {
            online: 0,
            offline: 3,
            with_friends: 5
        },
        examples: {
            online: 'Watching YouTube',
            offline: 'Practicing guitar alone',
            with_friends: 'Playing basketball with friends'
        }
    },

    durationBonus: {
        description: 'Minutes divided by 5. This prevents XP explosions.',
        formula: 'duration_minutes / 5',
        example: '30 minutes → 6 XP'
    },

    xpFormula: {
        description: 'If productivity = 0, XP MUST be 0. Otherwise:',
        formula: 'XP = (productivity * difficulty) + (duration_minutes / 5) + offline_bonus',
        example: 'If productivity = 0 → XP = 0 even if duration is long.'
    },

    examples: [
        { task: '1 hour YouTube', productivity: 0, difficulty: 1, duration_minutes: 60, offline_bonus: 0, xp: 0, reason: 'Online entertainment. No productivity.' },
        { task: '30 minutes piano practice', productivity: 4, difficulty: 3, duration_minutes: 30, offline_bonus: 3, xp: 21, reason: 'Skill-building, offline.' },
        { task: '10 minutes cycling', productivity: 3, difficulty: 2, duration_minutes: 10, offline_bonus: 3, xp: 11, reason: 'Health, offline.' },
        { task: '45 minutes math study', productivity: 5, difficulty: 4, duration_minutes: 45, offline_bonus: 0, xp: 65, reason: 'High long-term value.' },
        { task: '20 minutes cleaning room', productivity: 2, difficulty: 2, duration_minutes: 20, offline_bonus: 3, xp: 13, reason: 'Light productivity, offline.' },
        { task: '1 hour basketball with friends', productivity: 4, difficulty: 3, duration_minutes: 60, offline_bonus: 5, xp: 47, reason: 'Social + physical.' },
        { task: '15 minutes vocabulary practice', productivity: 4, difficulty: 3, duration_minutes: 15, offline_bonus: 0, xp: 27, reason: 'High learning value.' },
        { task: '2 hours TikTok', productivity: 0, difficulty: 1, duration_minutes: 120, offline_bonus: 0, xp: 0, reason: 'No productivity.' },
        { task: '25 minutes guitar practice', productivity: 4, difficulty: 3, duration_minutes: 25, offline_bonus: 3, xp: 20, reason: 'Skill-building.' },
        { task: '40 minutes jogging', productivity: 4, difficulty: 3, duration_minutes: 40, offline_bonus: 3, xp: 37, reason: 'Health + offline.' },
        { task: '30 minutes meditation', productivity: 3, difficulty: 1, duration_minutes: 30, offline_bonus: 3, xp: 18, reason: 'Mental health.' },
        { task: '50 minutes programming practice', productivity: 5, difficulty: 4, duration_minutes: 50, offline_bonus: 0, xp: 70, reason: 'High long-term value.' },
        { task: '10 minutes stretching', productivity: 2, difficulty: 1, duration_minutes: 10, offline_bonus: 3, xp: 7, reason: 'Light physical benefit.' },
        { task: '1 hour reading a book', productivity: 4, difficulty: 2, duration_minutes: 60, offline_bonus: 3, xp: 35, reason: 'Education + offline.' },
        { task: '30 minutes creative writing', productivity: 3, difficulty: 3, duration_minutes: 30, offline_bonus: 0, xp: 27, reason: 'Creative skill.' },
        { task: '20 minutes Spanish practice', productivity: 4, difficulty: 3, duration_minutes: 20, offline_bonus: 0, xp: 32, reason: 'High learning value.' },
        { task: '90 minutes drumming practice', productivity: 4, difficulty: 4, duration_minutes: 90, offline_bonus: 3, xp: 63, reason: 'Skill-building + offline.' },
        { task: '15 minutes Instagram scrolling', productivity: 0, difficulty: 1, duration_minutes: 15, offline_bonus: 0, xp: 0, reason: 'No productivity.' },
        { task: '1 hour coding project', productivity: 5, difficulty: 4, duration_minutes: 60, offline_bonus: 0, xp: 80, reason: 'High long-term value.' },
        { task: '30 minutes walk with friends', productivity: 3, difficulty: 1, duration_minutes: 30, offline_bonus: 5, xp: 23, reason: 'Social + offline.' }
    ],

    systemPrompt: `You are a productivity task scorer. Given a user's description of what they did or plan to do, and their long-term goals, you must score the task.

SCORING SYSTEM:

1. PRODUCTIVITY (0-5): How much does the task contribute to the user's long-term goals?
   - 0: No benefit at all (e.g., watching TikTok, scrolling Instagram)
   - 1: Very small benefit (e.g., light stretching for 2 minutes)
   - 2: Small benefit (e.g., cleaning your desk quickly)
   - 3: Medium benefit (e.g., reading a book for 20 minutes)
   - 4: High benefit (e.g., practicing an instrument for 30 minutes)
   - 5: Very high benefit (e.g., studying math or coding for 1 hour)
   IMPORTANT: The user's 5-year goals override all examples. If the user does NOT mention a task type as a goal, that task type MUST receive productivity = 0.

2. DIFFICULTY (1-5): How hard was the task mentally or physically?
   - 1: Very easy (e.g., wiping a table)
   - 2: Easy (e.g., light jogging)
   - 3: Medium (e.g., practicing piano with focus)
   - 4: Hard (e.g., solving math problems)
   - 5: Very hard (e.g., learning advanced programming concepts)

3. OFFLINE_BONUS (0, 3, or 5): Bonus based on context
   - 0: online/digital tasks (e.g., watching YouTube, coding on a computer is offline=0)
   - 3: offline tasks done alone (e.g., practicing guitar alone, jogging alone)
   - 5: tasks done with friends (e.g., playing basketball with friends, walking with friends)

4. DURATION: Estimate in minutes. Default to 30 if not stated.

5. XP CALCULATION (the server will compute this, but you must understand it):
   - If productivity = 0, XP MUST be 0
   - Otherwise: XP = (productivity * difficulty) + (duration_minutes / 5) + offline_bonus
   - Example: productivity=4, difficulty=3, duration=30, offline=3 → XP = 12 + 6 + 3 = 21

OUTPUT FORMAT:
Return ONLY a JSON object with this exact structure:
{
    "name": "string (max 60 chars)",
    "duration": number (minutes),
    "productivity": number (0-5),
    "difficulty": number (1-5),
    "offline_bonus": number (0, 3, or 5),
    "xp": number (calculated using the formula above),
    "category": "string (one of: deep-work, learning, exercise, creative, admin, social, other)"
}

Do not include any explanation or extra text. Only the JSON object.

EXAMPLES:
- 1 hour YouTube → productivity: 0, difficulty: 1, duration: 60, offline_bonus: 0, xp: 0
- 30 minutes piano practice → productivity: 4, difficulty: 3, duration: 30, offline_bonus: 3, xp: 21
- 10 minutes cycling → productivity: 3, difficulty: 2, duration: 10, offline_bonus: 3, xp: 11
- 45 minutes math study → productivity: 5, difficulty: 4, duration: 45, offline_bonus: 0, xp: 65
- 20 minutes cleaning room → productivity: 2, difficulty: 2, duration: 20, offline_bonus: 3, xp: 13
- 1 hour basketball with friends → productivity: 4, difficulty: 3, duration: 60, offline_bonus: 5, xp: 47
- 2 hours TikTok → productivity: 0, difficulty: 1, duration: 120, offline_bonus: 0, xp: 0`
};

module.exports = aiRatingConfig;
