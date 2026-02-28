// Import Firebase Tools
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, collection, onSnapshot, addDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Your exact Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyA_lmaWDdayWIOKK02h2uvZSeBasdUonXc",
  authDomain: "chat-with-anyone-73526.firebaseapp.com",
  projectId: "chat-with-anyone-73526",
  storageBucket: "chat-with-anyone-73526.firebasestorage.app",
  messagingSenderId: "440915092993",
  appId: "1:440915092993:web:96e7af7a1a05156ae6c200",
  measurementId: "G-E856F2F0B0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global Variables
let currentUser = null;
let currentChatId = null;
let currentChatUser = null;
let unsubscribeMessages = null; // Stops listening to old chats when switching contacts

// DOM Elements
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userList = document.getElementById("user-list");
const chatWithName = document.getElementById("chat-with-name");
const messagesContainer = document.getElementById("messages");
const inputArea = document.getElementById("input-area");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");

// Profile Modal Elements
const editProfileBtn = document.getElementById("edit-profile-btn");
const profileModal = document.getElementById("profile-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const saveProfileBtn = document.getElementById("save-profile-btn");
const editNameInput = document.getElementById("edit-name-input");
const editPicInput = document.getElementById("edit-pic-input");

// --- 1. AUTHENTICATION & PROFILE SAVING ---
loginBtn.addEventListener("click", () => signInWithPopup(auth, new GoogleAuthProvider()));
logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        loginScreen.style.display = "none";
        appScreen.style.display = "flex";
        
        // Display user info on screen
        document.getElementById("my-name").textContent = user.displayName;
        document.getElementById("my-profile-pic").src = user.photoURL;

        // Save/Update the user in Firestore so others can see them
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            photoURL: user.photoURL
        }, { merge: true });

        loadUsers();
    } else {
        currentUser = null;
        loginScreen.style.display = "flex";
        appScreen.style.display = "none";
        if (unsubscribeMessages) unsubscribeMessages();
    }
});

// --- 2. LOAD CONTACTS (SIDEBAR) ---
function loadUsers() {
    onSnapshot(collection(db, "users"), (snapshot) => {
        userList.innerHTML = ""; 
        snapshot.forEach((doc) => {
            const otherUser = doc.data();
            if (otherUser.uid !== currentUser.uid) { // Don't show ourselves
                const li = document.createElement("li");
                li.innerHTML = `<img src="${otherUser.photoURL}" width="35" style="border-radius:50%; margin-right:10px;"> ${otherUser.name}`;
                li.addEventListener("click", () => openPrivateChat(otherUser));
                userList.appendChild(li);
            }
        });
    });
}

// --- 3. OPEN A CHAT & LOAD MESSAGES ---
function openPrivateChat(otherUser) {
    currentChatUser = otherUser;
    
    // Generate the unique Room ID (Alphabetical order of UIDs)
    currentChatId = currentUser.uid < otherUser.uid 
        ? currentUser.uid + "_" + otherUser.uid 
        : otherUser.uid + "_" + currentUser.uid;

    chatWithName.textContent = `Chatting with ${otherUser.name}`;
    inputArea.style.display = "flex"; 

    // Stop listening to the previous chat if we clicked a new person
    if (unsubscribeMessages) unsubscribeMessages();

    // Fetch messages for this specific room
    const messagesRef = collection(db, "chats", currentChatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = ""; // Clear old messages
        snapshot.forEach((doc) => {
            const msg = doc.data();
            const div = document.createElement("div");
            // Check if the message is from me or them to apply CSS later
            div.className = msg.senderId === currentUser.uid ? "message my-message" : "message their-message";
            div.textContent = msg.text;
            messagesContainer.appendChild(div);
        });
        // Auto-scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// --- 4. SEND A MESSAGE ---
sendBtn.addEventListener("click", async () => {
    const text = messageInput.value.trim();
    if (!text || !currentChatId) return;
    
    messageInput.value = ""; // Clear the box instantly

    // SECURITY FIX: Make sure the Room Document exists with 'participants'
    // This satisfies your Firestore Security Rule so you don't get 'Missing Permissions'
    const chatRoomRef = doc(db, "chats", currentChatId);
    await setDoc(chatRoomRef, {
        participants: [currentUser.uid, currentChatUser.uid]
    }, { merge: true });

    // Save the actual message inside that room
    await addDoc(collection(db, "chats", currentChatId, "messages"), {
        text: text,
        senderId: currentUser.uid,
        timestamp: serverTimestamp()
    });
});

// Allow hitting "Enter" to send
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendBtn.click();
});

// --- 5. EDIT PROFILE LOGIC ---
editProfileBtn.addEventListener("click", () => {
    editNameInput.value = currentUser.displayName;
    editPicInput.value = currentUser.photoURL;
    profileModal.style.display = "flex"; // Show modal
});

closeModalBtn.addEventListener("click", () => {
    profileModal.style.display = "none"; // Hide modal
});

saveProfileBtn.addEventListener("click", async () => {
    const newName = editNameInput.value.trim();
    const newPic = editPicInput.value.trim();
    
    if (newName && newPic) {
        // 1. Update the Google Auth profile
        await updateProfile(currentUser, { displayName: newName, photoURL: newPic });
        
        // 2. Update the Firestore Database so others see the change
        await updateDoc(doc(db, "users", currentUser.uid), {
            name: newName,
            photoURL: newPic
        });

        // 3. Update the screen
        document.getElementById("my-name").textContent = newName;
        document.getElementById("my-profile-pic").src = newPic;
        
        profileModal.style.display = "none";
        alert("Profile updated successfully!");
    }
});
