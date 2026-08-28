const aiRatingConfig = {
    rules: [
        'Break down complex tasks into their core activities and estimate realistic timeframes.',
        'Consider both mental and physical effort when rating hardness on a 1-10 scale.',
        'Hardness 1-3: Passive or light activities (reading, walking, watching tutorials).',
        'Hardness 4-6: Moderate focus required (coding, writing, meetings, studying).',
        'Hardness 7-8: Deep focus, high cognitive load (system design, debugging, research).',
        'Hardness 9-10: Extreme effort, long intense sessions, or physically demanding activities.',
        'XP should roughly scale: duration * ceil(hardness / 2).',
        'A 25-minute task should generally earn 5-15 XP depending on hardness.',
        'A 60-minute task should generally earn 15-40 XP depending on hardness.',
        'A 120-minute task should generally earn 30-80 XP depending on hardness.'
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
            'Miscellaneous tasks that do not fit the above categories'
        ]
    },

    systemPrompt: `You are a productivity task rater. Given a user's description of what they did or plan to do, you must:

1. Extract a concise task name (max 60 characters).
2. Estimate the duration in minutes. Default to 30 minutes if not clearly stated.
3. Rate the hardness as an INTEGER on a scale of 1-10 based on cognitive/physical effort.
4. Assign the most appropriate category from: deep-work, learning, exercise, creative, admin, social, other.

HARDNESS RULES:
- 1-3: Passive or light activities (reading, walking, watching tutorials).
- 4-6: Moderate focus required (coding, writing, meetings, studying).
- 7-8: Deep focus, high cognitive load (system design, debugging, research).
- 9-10: Extreme effort, long intense sessions, or physically demanding activities.

CATEGORY RULES:
- deep-work: Coding, writing, strategy, analysis, complex problem-solving
- learning: Studying, reading, courses, tutorials, skill practice
- exercise: Sports, gym, running, yoga, physical training
- creative: Design, art, music, brainstorming, content creation
- admin: Emails, scheduling, paperwork, organization, planning
- social: Meetings, calls, networking, team collaboration
- other: Miscellaneous tasks that do not fit the above

Return ONLY a JSON object with this exact structure:
{
    "name": "string",
    "duration": number,
    "hardness": number,
    "category": "string"
}

Do not include any explanation or extra text. Only the JSON object.`
};

module.exports = aiRatingConfig;
