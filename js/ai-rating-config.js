const aiRatingConfig = {
    systemPrompt: `Return ONLY this JSON (no other text, no markdown):

{"name":"short name","duration":minutes,"productivity":0-5,"difficulty":1-5,"category":"learning,exercise,creative,admin,social,deep-work,or other"}

Rules:
- productivity 0-5: how much it helps goals (0=waste, 5=great)
- difficulty 1-5: effort level
- duration: minutes
- category: pick the best one

Examples:
"I played the piano" -> {"name":"Played piano","duration":30,"productivity":4,"difficulty":3,"category":"creative"}
"watched YouTube 1 hour" -> {"name":"Watched YouTube","duration":60,"productivity":0,"difficulty":1,"category":"other"}
"coding 1 hour" -> {"name":"Coding","duration":60,"productivity":5,"difficulty":4,"category":"deep-work"}
"basketball with friends" -> {"name":"Basketball","duration":60,"productivity":4,"difficulty":3,"category":"exercise"}
"homework 1 hour" -> {"name":"Homework","duration":60,"productivity":4,"difficulty":2,"category":"learning"}
"jogging 30 min" -> {"name":"Jogging","duration":30,"productivity":4,"difficulty":3,"category":"exercise"}
"cleaned my room" -> {"name":"Cleaned room","duration":20,"productivity":2,"difficulty":2,"category":"admin"}

Return ONLY the JSON.`
};

module.exports = aiRatingConfig;
