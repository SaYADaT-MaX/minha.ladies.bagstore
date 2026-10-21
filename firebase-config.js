import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAlyFykT97h-kYFnv1RZ7OdyHwoFwAIiI4",
  authDomain: "minha-ladies-bag.firebaseapp.com",
  projectId: "minha-ladies-bag",
  storageBucket: "minha-ladies-bag.firebasestorage.app",
  messagingSenderId: "290207706461",
  appId: "1:290207706461:web:795b5e663b89e918c9ccb4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
