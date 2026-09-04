const aiRatingConfig = {
    systemPrompt: `Return ONLY this JSON (no other text, no markdown):

{"name":"short name","duration":minutes,"productivity":0-5,"difficulty":1-5,"bonus":0_or_3,"category":"learning,exercise,creative,admin,social,deep-work,or other"}

Rules:
- productivity 0-5: how much it helps goals (0=waste, 5=great)
- difficulty 1-5: effort level
- bonus: 3 for offline/physical OR with people, 0 for screens
- duration: minutes
- bonus=3 for: piano, guitar, drums, singing, jogging, running, cycling, gym, workout, exercise, yoga, meditation, reading, cleaning, cooking, walking, hiking, drawing, painting, studying, practicing, training, any physical activity, any task with friends/family
- bonus=0 for: YouTube, TikTok, Instagram, Netflix, coding, programming, browsing, scrolling, gaming, computer, phone, TV, streaming

Examples:
"I played the piano" -> {"name":"Played piano","duration":30,"productivity":4,"difficulty":3,"bonus":3,"category":"creative"}
"I practised piano for 30 min" -> {"name":"Piano practice","duration":30,"productivity":4,"difficulty":3,"bonus":3,"category":"creative"}
"practiced the piano" -> {"name":"Piano practice","duration":30,"productivity":4,"difficulty":3,"bonus":3,"category":"creative"}
"watched YouTube 1 hour" -> {"name":"Watched YouTube","duration":60,"productivity":0,"difficulty":1,"bonus":0,"category":"other"}
"coding 1 hour" -> {"name":"Coding","duration":60,"productivity":5,"difficulty":4,"bonus":0,"category":"deep-work"}
"basketball with friends" -> {"name":"Basketball","duration":60,"productivity":4,"difficulty":3,"bonus":3,"category":"exercise"}
"homework 1 hour" -> {"name":"Homework","duration":60,"productivity":4,"difficulty":2,"bonus":3,"category":"learning"}

Return ONLY the JSON.`
};

module.exports = aiRatingConfig;
