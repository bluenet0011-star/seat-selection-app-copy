const admin = require("firebase-admin");

const config = {
    projectId: "seat-selection-e5d23",
    clientEmail: "firebase-adminsdk-fbsvc@seat-selection-e5d23.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQD3rUveoGH/Pq81\nH0Dr5xab+Fn7Xdkfr45p4oHLN5fK+vLkSEJeW0yk+6mTt8kfQcpKx4f6fi2ncUDA\n3u2tdd1ELTYpw12UWL3jaSxz19kEyZT1ubqM2riPxObV09NQ80SwLyaDHT9SeRmE\n1JDY3H1NdFUEvduXMtGngm4HWsJGbQ/xeINFho77YNSceirBSFimi8H3fcMmCjsV\nTz58zkNdV4+ARK91EvTVAcmg6jeWS2IZp4LuNo/xnBPVwcwzzQcDQiPD9WFVan1D\nOsWvB8n73DWBeVJoY8PyETOVYTDwghoDj0/8w1RFHM016784vHrXsIRR6+5CWZfA\nZTpwDZNXAgMBAAECgf8HatPa1vLDB3LiebfNWMj/OBt5wQBqR9emqXc5nsXs+OxN\nPzIS9qj/nTR24rTN5X/UEtBVBXJYkWEJuvi4jnm8kPNjoiDV+ye0p8cCW8nOsDrF\ny8ofwxfD4SGzRaS5HTqcDCLFym/FszAQdPfhhrjkmOydjRIGdSnSL8BxIpwEKoY6\nSrR1bt4UdURkfxPu9nHqBg+5QV+Yg/Sdd8R9O/rLEjRwXpi5cvPc4fxK4b5buwz7\nvnalM3neEOJye+1xwueOMbsg6HC9+wKFpS+/ck6H5ffJGApbv/7wEtNafF+RiZm5\nbWY0n5aofqpMOrdMsfF7WXPZ1WeIUwEg/EtL6bECgYEA/4sRyZki7GwFSG3bGR0L\nRESRt2q+bDv26qdpZyEAHV6aGXaNZnZL1AQmBsDP6k54P/vGLgQlXHZr+jvsFfxx\n6d4uCYAZ8c+gSUszVJ2jQzupJf1EDs5moJDLWv2FjvUGnMbDr04VPKxHtmOuFJes\n/TSwlS+/JPZxgXXkety9hB8CgYEA+B6goJymp7ECC5qwwIF+W0cygkqEciVwNc8Q\nt2bf4kr1LVq2GVZMWS9mY/rLLwBWK6pM2Jw5q6C98jR7SUzgKNPeBFsLOGya1UZT\n9KM2LnaRteZRVePEyaG9DR4niegzEFIgi4yIcl5mHb9//SQHYXfVmofsm64Crh5R\nO7jsSckCgYEA+ts7f+rblLlJyltFXPbdC4xAe4zHGBsZfisP1pRXt30Zy2tMzcvN\nDnlwFusKb9nORAlV9/BL+OOrhf9y9/ZUoR9hlCPz1CRdFfZDkooZLjQQDWH9gIdv\nyam6Zz0+8iJo9lhM2vfM8z2wPETILCDlSb+CpUE05AUlUdA4lb/CL0MCgYAcATD2\nD9hLkxH9B0+t2q/NU6Liy9BZJdqdaCql2KmqW/WCUfu9rlzdsBjpbfQi8PHI6ebU\niAWGVpU50iycIF4onYkwiqogizmKmu587TL/WYimtEE35YZfj67L3TxvN1MUI4Di\n31DDP95cuzGR+9ANcz4bu/27sI9C4c8fY4bf6QKBgQDwvDfhJ44PVx4rl0FtKJxU\nwrctnGcjv0h7JoFloV90b/DPlsjZPq2fFoEJTSOv9m2WDSfTSRy77iHOsri1bhg+\nbfJiCQaOXmKimHjbYEhOEoz9QUFiQzZlcp1SF+L7HJzb+tIJD0+AhBDvvlGnlknE\n5jA6RQmqnOFx4a+MyfXUkw==\n-----END PRIVATE KEY-----\n".replace(/\\n/g, "\n")
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(config)
    });
}

const auth = admin.auth();
const db = admin.firestore();

async function run() {
    console.log("Starting debug simulation...");
    const id = "debug_" + Date.now();
    try {
        console.log("1. Creating User in Auth...");
        const user = await auth.createUser({
            uid: id,
            email: id + "@school.com",
            password: "password123",
            displayName: "Debug User"
        });
        console.log("Success: Auth User created", user.uid);

        console.log("2. Saving to Firestore...");
        await db.collection("users").doc(id).set({
            id, name: "Debug", role: "student", createdAt: new Date().toISOString()
        });
        console.log("Success: Firestore Document saved");
    } catch (e) {
        console.error("ERROR ENCOUNTERED:", e.code, e.message);
    }
}

run();
