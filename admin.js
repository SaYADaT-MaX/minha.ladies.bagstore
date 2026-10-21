import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

const ADMIN_UID = "utwqpe1ozLNCFKivDm6LKQonNM62";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const dashboard = document.getElementById("dashboard");
const logoutButton = document.getElementById("logoutButton");
const message = document.getElementById("message");

function showDashboard() {
  form.classList.add("hidden");
  dashboard.classList.remove("hidden");
  message.textContent = "";
}

function showLogin() {
  form.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showLogin();
    return;
  }

  if (user.uid === ADMIN_UID) {
    showDashboard();
  } else {
    await signOut(auth);
    showLogin();
    message.textContent = "Access denied: this account is not an admin.";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginButton.disabled = true;
  message.textContent = "Signing in...";

  try {
    const result = await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );

    if (result.user.uid !== ADMIN_UID) {
      await signOut(auth);
      throw new Error("This account is not authorized as admin.");
    }

    showDashboard();
  } catch (error) {
    message.textContent =
      error.code === "auth/invalid-credential"
        ? "Email or password is incorrect."
        : error.message || "Login failed. Please try again.";
  } finally {
    loginButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  passwordInput.value = "";
  showLogin();
  message.textContent = "You have logged out.";
});
