const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

exports.deleteSelf = onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let decodedToken;
    try {
        decodedToken = await admin.auth().verifyIdToken(authHeader.slice(7));
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const uid = decodedToken.uid;

    try {
        const userDoc = await admin.firestore().collection('users').doc(uid).get();
        const username = userDoc.exists ? userDoc.data().username : null;

        await admin.auth().deleteUser(uid);
        await admin.firestore().collection('users').doc(uid).delete();
        if (username) {
            await admin.firestore().collection('usernames').doc(username.toLowerCase()).delete();
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('deleteSelf error:', err);
        return res.status(500).json({ error: err.message });
    }
});

exports.deleteUser = onRequest({ cors: false, invoker: 'public' }, async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let decodedToken;
    try {
        decodedToken = await admin.auth().verifyIdToken(authHeader.slice(7));
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const callerDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'Missing uid' });
    if (uid === decodedToken.uid) return res.status(400).json({ error: 'Cannot delete your own account' });

    try {
        const userDoc = await admin.firestore().collection('users').doc(uid).get();
        if (userDoc.exists && userDoc.data().role === 'admin') {
            return res.status(403).json({ error: 'Cannot delete an admin account. Remove admin role first.' });
        }
        const username = userDoc.exists ? userDoc.data().username : null;

        await admin.auth().deleteUser(uid);
        await admin.firestore().collection('users').doc(uid).delete();
        if (username) {
            await admin.firestore().collection('usernames').doc(username.toLowerCase()).delete();
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('deleteUser error:', err);
        return res.status(500).json({ error: err.message });
    }
});
