const aiRatingConfig = {
    taskSizes: {
        mini: 5,
        small: 10,
        medium: 20,
        big: 40,
        extreme: 60
    },

    rules: [
        'Break down complex tasks into their core activities and estimate realistic timeframes.',
        'Consider both mental and physical effort when rating hardness on a 1-10 scale.',
        'Hardness 1-3: Passive or light activities (reading, walking, watching tutorials).',
        'Hardness 4-6: Moderate focus required (coding, writing, meetings, studying).',
        'Hardness 7-8: Deep focus, high cognitive load (system design, debugging, research).',
        'Hardness 9-10: Extreme effort, long intense sessions, or physically demanding activities.',
        'Assign a task size based on scope and impact: mini (small habit, <15 min), small (routine task, 15-45 min), medium (project work, 45-120 min), big (major deliverable, 2-4 hours), extreme (all-day deep work, 4+ hours).',
        'Rate usefulness from 1-10 based on how well the task aligns with the user stated goals.',
        'If the task is clearly unrelated to the user goals, usefulness should be low (1-3).',
        'If the task directly advances a stated goal, usefulness should be high (7-10).',
        'If goals are empty or unclear, default usefulness to 5.'
    ],

    categories: {
        'deep-work': { name: 'Deep Work', color: '#4a90d9', icon: '🧠' },
        'learning': { name: 'Learning', color: '#4caf50', icon: '📚' },
        'exercise': { name: 'Exercise', color: '#f39c12', icon: '💪' },
        'creative': { name: 'Creative', color: '#e74c3c', icon: '🎨' },
        'admin': { name: 'Administrative', color: '#9b59b6', icon: '📋' },
        'social': { name: 'Social', color: '#1abc9c', icon: '👥' },
        'other': { name: 'Other', color: '#95a5a6', icon: '📌' }
    },

    categoryRules: {
        'deep-work': [
            'Coding, writing, strategy, analysis, complex problem-solving',
            'High mental effort, minimal distractions'
        ],
        'learning': [
            'Studying, reading, courses, tutorials, skill practice',
            'Active learning, not passive consumption'
        ],
        'exercise': [
            'Sports, gym, running, yoga, physical training'
        ],
        'creative': [
            'Design, art, music, brainstorming, content creation'
        ],
        'admin': [
            'Emails, scheduling, paperwork, organization, planning'
        ],
        'social': [
            'Meetings, calls, networking, team collaboration'
        ],
        'other': [
            'Miscellaneous tasks that do not fit the above'
        ]
    },

    systemPrompt: `You are a productivity task rater. Given a user's description of what they did or plan to do, and their long-term goals, you must:

1. Extract a concise task name (max 60 characters).
2. Estimate the duration in minutes. Default to 30 minutes if not clearly stated.
3. Rate the hardness as an INTEGER on a scale of 1-10 based on cognitive/physical effort.
4. Assign the most appropriate category from: deep-work, learning, exercise, creative, admin, social, other.
5. Assign a task size from: mini, small, medium, big, extreme.
6. Rate usefulness as an INTEGER from 1-10 based on how well this task advances the user's stated goals.

HARDNESS RULES:
- 1-3: Passive or light activities (reading, walking, watching tutorials).
- 4-6: Moderate focus required (coding, writing, meetings, studying).
- 7-8: Deep focus, high cognitive load (system design, debugging, research).
- 9-10: Extreme effort, long intense sessions, or physically demanding activities.

TASK SIZE RULES:
- mini: small habit, quick win, <15 minutes.
- small: routine task, 15-45 minutes.
- medium: project work, 45-120 minutes.
- big: major deliverable, 2-4 hours.
- extreme: all-day deep work, 4+ hours.

USEFULNESS RULES:
- 1-3: Unrelated or weakly related to goals.
- 4-6: Somewhat useful, indirect progress.
- 7-10: Directly advances a stated goal.

Return ONLY a JSON object with this exact structure:
{
    "name": "string",
    "duration": number,
    "hardness": number,
    "category": "string",
    "taskSize": "mini|small|medium|big|extreme",
    "usefulness": number
}

Do not include any explanation or extra text. Only the JSON object.`
};

module.exports = aiRatingConfig;
