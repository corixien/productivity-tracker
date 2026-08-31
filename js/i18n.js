const translations = {
    en: {
        appTitle: "Productivity Tracker",
        authSubtitle: "Sign in with your username to start tracking",
        registerSubtitle: "Create a new account",
        usernamePlaceholder: "Username",
        passwordPlaceholder: "Password",
        rememberMe: "Remember me",
        signIn: "Sign In",
        register: "Register",
        navMain: "Tasks",
        navLeaderboard: "Leaderboard",
        navSettings: "Settings",
        xpProgress: "XP Progress",
        addTask: "Add Task",
        pendingTasks: "Pending Tasks",
        completedTasks: "Completed Tasks",
        leaderboardTitle: "Leaderboard",
        addFriend: "+ Add Friend",
        friendUsernamePlaceholder: "Username",
        add: "Add",
        colRank: "Rank",
        colUser: "User",
        colXP: "XP",
        colTasks: "Tasks",
        settingsTitle: "Settings",
        username: "Username",
        changePassword: "Change Password",
        newPasswordPlaceholder: "New password",
        save: "Save",
        profilePicture: "Profile Picture",
        uploadAvatar: "Upload Avatar",
        language: "Language",
        credits: "Credits",
        creditsText: "Built with Kilo Code. Main contributor: Mateo Rettenberger.",
        builtWith: "Built with Kilo Code",
        mainContributor: "Main contributor: Mateo Rettenberger",
        signOut: "Sign Out",
        taskName: "Task Name",
        duration: "Duration (minutes)",
        hardness: "Hardness (1-10)",
        xpPreview: "XP Preview",
        close: "Close",
        noPendingTasks: "No pending tasks. Add one to get started!",
        noCompletedTasks: "No completed tasks yet.",
        noFriends: "No friends added yet. Add a friend to compete!",
        friendAdded: "Friend added successfully!",
        friendNotFound: "Friend not found. They need to sign up first.",
        passwordChanged: "Password changed successfully!",
        invalidUsername: "Please enter a valid username.",
        invalidPassword: "Password must be at least 4 characters.",
        taskCreated: "Task created!",
        taskCompleted: "Task completed!",
        taskDeleted: "Task deleted.",
        rankNewcomer: "Newcomer",
        rankBronze: "Bronze",
        rankSilver: "Silver",
        rankGold: "Gold",
        rankPlatinum: "Platinum",
        rankDiamond: "Diamond",
        rankMaster: "Master",
        xpEarned: "XP Earned",
        delete: "Delete",
        describeTask: "Describe your task",
        aiTaskPlaceholder: "e.g., I studied React hooks for 45 minutes...",
        aiSubmit: "Let AI Rate It",
        aiRating: "AI is rating your task...",
        addPendingTask: "Add Pending Task",
        addCompletedTask: "Add Completed Task",
        aiFailed: "AI rating failed. Please try again.",
        aiTimeout: "AI rating timed out. Please try again.",
        aiNotConfigured: "AI is not configured on the server. Please fill in manually."
    },
    de: {
        appTitle: "Produktivitäts-Tracker",
        authSubtitle: "Melde dich mit deinem Benutzernamen an",
        registerSubtitle: "Erstelle ein neues Konto",
        usernamePlaceholder: "Benutzername",
        passwordPlaceholder: "Passwort",
        rememberMe: "Angemeldet bleiben",
        signIn: "Anmelden",
        register: "Registrieren",
        navMain: "Aufgaben",
        navLeaderboard: "Bestenliste",
        navSettings: "Einstellungen",
        xpProgress: "XP-Fortschritt",
        addTask: "Aufgabe hinzufügen",
        pendingTasks: "Ausstehende Aufgaben",
        completedTasks: "Erledigte Aufgaben",
        leaderboardTitle: "Bestenliste",
        addFriend: "+ Freund hinzufügen",
        friendUsernamePlaceholder: "Benutzername",
        add: "Hinzufügen",
        colRank: "Rang",
        colUser: "Benutzer",
        colXP: "XP",
        colTasks: "Aufgaben",
        settingsTitle: "Einstellungen",
        username: "Benutzername",
        changePassword: "Passwort ändern",
        newPasswordPlaceholder: "Neues Passwort",
        save: "Speichern",
        profilePicture: "Profilbild",
        uploadAvatar: "Avatar hochladen",
        language: "Sprache",
        credits: "Credits",
        creditsText: "Erstellt mit Kilo Code. Hauptentwickler: Mateo Rettenberger.",
        builtWith: "Erstellt mit Kilo Code",
        mainContributor: "Hauptentwickler: Mateo Rettenberger",
        signOut: "Abmelden",
        taskName: "Aufgabenname",
        duration: "Dauer (Minuten)",
        hardness: "Schwierigkeit (1-10)",
        xpPreview: "XP-Vorschau",
        close: "Schließen",
        noPendingTasks: "Keine ausstehenden Aufgaben. Füge eine hinzu!",
        noCompletedTasks: "Noch keine erledigten Aufgaben.",
        noFriends: "Noch keine Freunde hinzugefügt. Füge einen Freund hinzu!",
        friendAdded: "Freund erfolgreich hinzugefügt!",
        friendNotFound: "Freund nicht gefunden. Er muss sich zuerst anmelden.",
        passwordChanged: "Passwort erfolgreich geändert!",
        invalidUsername: "Bitte gib einen gültigen Benutzernamen ein.",
        invalidPassword: "Passwort muss mindestens 4 Zeichen haben.",
        taskCreated: "Aufgabe erstellt!",
        taskCompleted: "Aufgabe erledigt!",
        taskDeleted: "Aufgabe gelöscht.",
        rankNewcomer: "Neuling",
        rankBronze: "Bronze",
        rankSilver: "Silber",
        rankGold: "Gold",
        rankPlatinum: "Platin",
        rankDiamond: "Diamant",
        rankMaster: "Meister",
        xpEarned: "XP erhalten",
        delete: "Löschen",
        describeTask: "Beschreibe deine Aufgabe",
        aiTaskPlaceholder: "z.B. Ich habe React 45 Minuten lang gelernt...",
        aiSubmit: "Von KI bewerten lassen",
        aiRating: "KI bewertet deine Aufgabe...",
        addPendingTask: "Ausstehende Aufgabe hinzufügen",
        addCompletedTask: "Erledigte Aufgabe hinzufügen",
        aiFailed: "KI-Bewertung fehlgeschlagen. Bitte versuche es erneut.",
        aiTimeout: "KI-Bewertung dauerte zu lange. Bitte versuche es erneut.",
        aiNotConfigured: "KI ist auf dem Server nicht konfiguriert. Bitte fülle manuell aus."
    }
};

let currentLang = localStorage.getItem('lang') || 'en';

function t(key) {
    return translations[currentLang][key] || key;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang][key]) {
            el.placeholder = translations[lang][key];
        }
    });
    document.documentElement.lang = lang;
}

function getCurrentLang() {
    return currentLang;
}

export { t, setLanguage, getCurrentLang, translations };
