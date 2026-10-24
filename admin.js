import { auth, db } from "./firebase-config.js";

import {
signInWithEmailAndPassword,
signOut,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
collection,
getDocs,
addDoc,
updateDoc,
deleteDoc,
doc,
getDoc,
setDoc,
serverTimestamp,
Timestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const ADMIN_UID = "utwqpe1ozLNCFKivDm6LKQonNM62";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const dashboard = document.getElementById("dashboard");
const message = document.getElementById("message");

let editingId = null;
let productsCache = [];
let savingSettings = false;
let loadingOrders = false;
let loadingProducts = false;

function safe(value) {
return String(value ?? "").replace(/[&<>"']/g, char => ({
"&": "&",
"<": "<",
">": ">",
'"': """,
"'": "'"
})[char]);
}

function money(value) {
const amount = Number(value);

return Number.isFinite(amount)
? "৳" + amount.toLocaleString("en-BD")
: "—";
}

function showMessage(text) {
const box = document.getElementById("panelMessage");

if (box) {
box.textContent = text;
} else if (message) {
message.textContent = text;
}
}

function isAdmin() {
return Boolean(
auth.currentUser &&
auth.currentUser.uid === ADMIN_UID
);
}

function requireAdmin() {
if (isAdmin()) return true;

showMessage("Unauthorized. Please log in as the admin.");
return false;
}

function showLogin() {
loginForm.classList.remove("hidden");
dashboard.classList.add("hidden");
}

function getOrderItems(items) {
if (Array.isArray(items)) return items;

if (items && typeof items === "object") {
return Object.values(items);
}

if (items) return [{ name: String(items) }];

return [];
}

function renderOrderItems(items) {
const normalized = getOrderItems(items);

if (!normalized.length) {
return "<p>No item details available.</p>";
}

return "<div class="order-items-list"> ${normalized.map((item, index) => { if (!item || typeof item !== "object") { return"
<div class="order-item">
${safe(item ?? "Product")}
</div>
`;
}

    const name =
      item.name ||
      item.productName ||
      item.title ||
      item.product ||
      "Product";

    const quantity = Number(item.quantity ?? item.qty ?? 1);
    const price = Number(item.price ?? item.unitPrice);
    const explicitTotal = item.subtotal ?? item.lineTotal;

    const calculatedTotal =
      Number.isFinite(price) && Number.isFinite(quantity)
        ? price * quantity
        : null;

    const lineTotal = explicitTotal != null
      ? Number(explicitTotal)
      : calculatedTotal;

    return `
      <div class="order-item">
        <strong>${safe(name)}</strong>
        <p>Item #${index + 1}</p>
        <p>Quantity: ${safe(quantity)}</p>
        <p>Unit price: ${safe(money(price))}</p>
        ${
          Number.isFinite(lineTotal)
            ? `<p>Item total: <strong>${safe(money(lineTotal))}</strong></p>`
            : ""
        }
      </div>
    `;
  }).join("")}
</div>

`;
}

function formatDate(value) {
if (!value) return "Not set";

let date;

if (typeof value.toDate === "function") {
date = value.toDate();
} else if (value instanceof Date) {
date = value;
} else {
date = new Date(value);
}

if (Number.isNaN(date.getTime())) return "Not set";

return date.toLocaleString("en-BD", {
dateStyle: "medium",
timeStyle: "short"
});
}

function showDashboard() {
if (!isAdmin()) {
showLogin();
return;
}

loginForm.classList.add("hidden");
dashboard.classList.remove("hidden");

if (dashboard.dataset.ready === "yes") return;

dashboard.dataset.ready = "yes";

dashboard.innerHTML = `
<style>
#dashboard {
width: 100%;
max-width: 100%;
min-width: 0;
overflow-wrap: anywhere;
}

  #dashboard *,
  #dashboard *::before,
  #dashboard *::after {
    box-sizing: border-box;
  }

  #dashboard input,
  #dashboard textarea,
  #dashboard select {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 11px;
    border: 1px solid #d8cbd2;
    border-radius: 8px;
    font: inherit;
    background: #fff;
  }

  #dashboard input[type="checkbox"] {
    width: auto;
  }

  #dashboard label {
    display: block;
    margin: 12px 0 6px;
    font-weight: 600;
  }

  #dashboard button {
    max-width: 100%;
    padding: 10px 12px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
  }

  #dashboard button:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  #dashboard .admin-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  #dashboard .admin-top button {
    width: auto;
    margin: 0;
  }

  #dashboard .admin-section {
    margin-top: 24px;
    min-width: 0;
  }

  #dashboard .admin-card {
    width: 100%;
    min-width: 0;
    padding: 14px;
    margin: 14px 0;
    border: 1px solid #eadde3;
    border-radius: 12px;
    background: #fff;
    overflow-wrap: anywhere;
  }

  #dashboard .admin-card p {
    line-height: 1.55;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  #dashboard .order-items-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin-top: 10px;
  }

  #dashboard .order-item {
    min-width: 0;
    padding: 12px;
    border: 1px solid #eadde3;
    border-radius: 9px;
    background: #fcf8fa;
    overflow-wrap: anywhere;
  }

  #dashboard .order-summary {
    padding: 11px;
    margin: 12px 0;
    background: #f8f1f4;
    border-radius: 9px;
  }

  #dashboard .order-summary p {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 12px;
  }

  #dashboard .save-order {
    width: 100%;
    margin-top: 14px;
    background: #8b315c;
    color: #fff;
    font-weight: 700;
  }

  #dashboard .admin-divider {
    margin: 22px 0;
    border: 0;
    border-top: 1px solid #eadde3;
  }

  #dashboard .payment-box {
    padding: 12px;
    margin: 12px 0;
    background: #fcf8fa;
    border: 1px solid #eadde3;
    border-radius: 9px;
  }

  #dashboard .help-text {
    font-size: 13px;
    color: #766771;
    line-height: 1.6;
  }

  #dashboard .status-note {
    padding: 10px;
    border-radius: 8px;
    background: #f8f1f4;
    line-height: 1.6;
  }

  @media (min-width: 600px) {
    #dashboard .order-items-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 380px) {
    #dashboard .admin-card {
      padding: 10px;
    }
  }
</style>

<div class="admin-top">
  <h2>MINHA Admin Panel</h2>
  <button id="logoutButton" type="button">Logout</button>
</div>

<p id="panelMessage" role="status" aria-live="polite"></p>

<hr class="admin-divider">

<section class="admin-section">
  <h3>Payment Settings</h3>

  <p class="help-text">
    Enter the seller's official receiving numbers.
    Customers can use these details after their orders are confirmed.
  </p>

  <form id="paymentSettingsForm">
    <label for="bkashNumber">bKash Number</label>
    <input
      id="bkashNumber"
      type="tel"
      maxlength="25"
      autocomplete="off"
      placeholder="Enter bKash number"
    >

    <label for="nagadNumber">Nagad Number</label>
    <input
      id="nagadNumber"
      type="tel"
      maxlength="25"
      autocomplete="off"
      placeholder="Enter Nagad number"
    >

    <label for="rocketNumber">Rocket Number</label>
    <input
      id="rocketNumber"
      type="tel"
      maxlength="25"
      autocomplete="off"
      placeholder="Enter Rocket number"
    >

    <button id="savePaymentSettings" type="submit">
      Save Payment Numbers
    </button>
  </form>
</section>

<hr class="admin-divider">

<section class="admin-section">
  <h3 id="formHeading">Add New Product</h3>

  <form id="productForm">
    <label for="pName">Product Name *</label>
    <input id="pName" required maxlength="120">

    <label for="pPrice">Price (৳) *</label>
    <input id="pPrice" type="number" min="0" step="1" required>

    <label for="pStock">Stock Quantity *</label>
    <input id="pStock" type="number" min="0" step="1" required>

    <label for="pImage">Image URL *</label>
    <input
      id="pImage"
      type="url"
      required
      placeholder="https://example.com/bag.jpg"
    >

    <label for="pCategory">Category</label>
    <input id="pCategory" placeholder="Handbags">

    <label for="pDescription">Description</label>
    <textarea id="pDescription" rows="3"></textarea>

    <label>
      <input id="pActive" type="checkbox" checked>
      Show this product on the website
    </label>

    <button id="saveProduct" type="submit">Save Product</button>
    <button id="cancelEdit" type="button" hidden>Cancel Edit</button>
  </form>
</section>

<hr class="admin-divider">

<section class="admin-section">
  <h3>Products</h3>
  <button id="refreshProducts" type="button">Refresh Products</button>
  <div id="productsList">Loading products...</div>
</section>

<hr class="admin-divider">

<section class="admin-section">
  <h3>Customer Orders & Payment Verification</h3>

  <p class="help-text">
    Confirm an order after reviewing its details and setting the delivery
    fee. The online-payment deadline is 30 minutes from the first
    confirmation. If the customer chooses COD, the My Orders page and
    Firestore Rules must handle COD without an advance-payment deadline.
    Verify online transactions in the seller's account before marking
    them Paid.
  </p>

  <button id="refreshOrders" type="button">Refresh Orders</button>
  <div id="ordersList">Loading orders...</div>
</section>

`;

document.getElementById("logoutButton").addEventListener("click", async () => {
try {
await signOut(auth);
} catch (error) {
showMessage("Logout failed: " + error.message);
}
});

document.getElementById("paymentSettingsForm")
.addEventListener("submit", savePaymentSettings);

document.getElementById("productForm")
.addEventListener("submit", saveProduct);

document.getElementById("cancelEdit")
.addEventListener("click", resetForm);

document.getElementById("refreshProducts")
.addEventListener("click", loadProducts);

document.getElementById("refreshOrders")
.addEventListener("click", loadOrders);

document.getElementById("productsList").addEventListener("click", async event => {
const button = event.target.closest("button[data-action]");

if (!button || !requireAdmin()) return;

const id = button.dataset.id;
const product = productsCache.find(item => item.id === id);

if (!product) return;

if (button.dataset.action === "edit") {
  editingId = id;

  document.getElementById("formHeading").textContent = "Edit Product";
  document.getElementById("pName").value = product.name || "";
  document.getElementById("pPrice").value = product.price ?? 0;
  document.getElementById("pStock").value = product.stock ?? 0;
  document.getElementById("pImage").value = product.imageUrl || "";
  document.getElementById("pCategory").value = product.category || "";
  document.getElementById("pDescription").value = product.description || "";
  document.getElementById("pActive").checked = product.active === true;
  document.getElementById("saveProduct").textContent = "Update Product";
  document.getElementById("cancelEdit").hidden = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

if (button.dataset.action === "delete") {
  if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) {
    return;
  }

  button.disabled = true;

  try {
    await deleteDoc(doc(db, "products", id));
    showMessage("Product deleted successfully.");
    await loadProducts();
  } catch (error) {
    console.error("Delete product error:", error);
    showMessage("Delete failed: " + error.message);
  } finally {
    button.disabled = false;
  }
}

});

document.getElementById("ordersList").addEventListener("click", async event => {
const button = event.target.closest("button[data-save-order]");

if (!button || !requireAdmin()) return;

const id = button.dataset.saveOrder;
const feeInput = document.getElementById("fee-" + id);
const courierInput = document.getElementById("courier-" + id);
const trackingInput = document.getElementById("tracking-" + id);
const statusInput = document.getElementById("status-" + id);
const paymentStatusInput = document.getElementById("payment-" + id);

if (!feeInput || !courierInput || !trackingInput ||
    !statusInput || !paymentStatusInput) {
  showMessage("Order fields not found. Refresh orders and try again.");
  return;
}

const deliveryFee = Number(feeInput.value);
const courierName = courierInput.value.trim();
const trackingNumber = trackingInput.value.trim();
const status = statusInput.value;
const paymentStatus = paymentStatusInput.value;

const allowedOrderStatuses = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled"
];

const allowedPaymentStatuses = [
  "unpaid",
  "unverified",
  "paid",
  "rejected"
];

if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
  showMessage("Delivery fee must be zero or a positive number.");
  return;
}

if (!allowedOrderStatuses.includes(status) ||
    !allowedPaymentStatuses.includes(paymentStatus)) {
  showMessage("Invalid order or payment status.");
  return;
}

if (paymentStatus === "paid" &&
    !confirm("Have you verified the payment in the receiving account?")) {
  return;
}

button.disabled = true;
button.textContent = "Saving Order...";

try {
  const orderRef = doc(db, "orders", id);
  const latestSnapshot = await getDoc(orderRef);

  if (!latestSnapshot.exists()) {
    throw new Error("This order no longer exists.");
  }

  const latestOrder = latestSnapshot.data();

  const subtotal = Number(latestOrder.total);

  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error("The order subtotal is invalid.");
  }

  const previousStatus = latestOrder.status || "pending";
  const now = new Date();

  const changes = {
    deliveryFee,
    grandTotal: subtotal + deliveryFee,
    courierName,
    trackingNumber,
    status,
    paymentStatus,
    updatedAt: serverTimestamp()
  };

  // Start the 30-minute deadline only on the first confirmation.
  if (previousStatus !== "confirmed" &&
      status === "confirmed" &&
      !latestOrder.confirmedAt) {
    changes.confirmedAt = serverTimestamp();

    if (latestOrder.paymentMethod !== "cod") {
      changes.paymentRequestedAt = serverTimestamp();
      changes.paymentDeadline = Timestamp.fromDate(
        new Date(now.getTime() + 30 * 60 * 1000)
      );
    }
  }

  if (paymentStatus === "paid") {
    changes.paidAt = serverTimestamp();
  }

  if (status === "cancelled") {
    changes.cancelledAt = serverTimestamp();
  }

  await updateDoc(orderRef, changes);

  showMessage(
    status === "confirmed"
      ? "Order confirmed. Delivery fee, grand total and confirmation details saved."
      : "Order and payment details saved successfully."
  );

  await loadOrders();
} catch (error) {
  console.error("Order update error:", error);
  showMessage("Order update failed: " + error.message);
  alert("Order update failed:\n" + error.message);
} finally {
  button.disabled = false;
  button.textContent = "Save Order & Payment Status";
}

});

loadPaymentSettings();
loadProducts();
loadOrders();
}

async function loadPaymentSettings() {
if (!requireAdmin()) return;

const form = document.getElementById("paymentSettingsForm");

if (!form) return;

try {
const snapshot = await getDoc(doc(db, "settings", "payment"));
const settings = snapshot.exists() ? snapshot.data() : {};

document.getElementById("bkashNumber").value =
  settings.bkashNumber || "";

document.getElementById("nagadNumber").value =
  settings.nagadNumber || "";

document.getElementById("rocketNumber").value =
  settings.rocketNumber || "";

showMessage(
  snapshot.exists()
    ? "Payment settings loaded."
    : "No payment numbers saved yet. Enter numbers and save."
);

} catch (error) {
console.error("Load payment settings error:", error);
showMessage("Could not load payment settings: " + error.message);
}
}

async function savePaymentSettings(event) {
event.preventDefault();

if (savingSettings || !requireAdmin()) return;

const bkashNumber = document.getElementById("bkashNumber").value.trim();
const nagadNumber = document.getElementById("nagadNumber").value.trim();
const rocketNumber = document.getElementById("rocketNumber").value.trim();

if (!bkashNumber && !nagadNumber && !rocketNumber) {
if (!confirm("All payment numbers are empty. Save empty settings?")) {
return;
}
}

const saveButton = document.getElementById("savePaymentSettings");

savingSettings = true;
saveButton.disabled = true;
saveButton.textContent = "Saving Payment Numbers...";

try {
await setDoc(
doc(db, "settings", "payment"),
{
bkashNumber,
nagadNumber,
rocketNumber,
updatedAt: serverTimestamp()
},
{ merge: true }
);

const check = await getDoc(doc(db, "settings", "payment"));

if (!check.exists()) {
  throw new Error("Saved settings could not be verified.");
}

const saved = check.data();

const matches =
  (saved.bkashNumber || "") === bkashNumber &&
  (saved.nagadNumber || "") === nagadNumber &&
  (saved.rocketNumber || "") === rocketNumber;

if (!matches) {
  throw new Error("The saved values do not match the entered numbers.");
}

showMessage("Payment numbers saved and verified successfully.");
alert("Success! Payment numbers saved to Firebase.");

} catch (error) {
console.error("Payment settings save error:", error);
showMessage("Could not save payment numbers: " + error.message);
alert(
"Could not save payment numbers.\n\n" + error.message +
"\n\nIf this says Missing or insufficient permissions, check Firestore Rules."
);
} finally {
savingSettings = false;

const currentButton = document.getElementById("savePaymentSettings");

if (currentButton) {
  currentButton.disabled = false;
  currentButton.textContent = "Save Payment Numbers";
}

}
}

function resetForm() {
editingId = null;

document.getElementById("productForm").reset();
document.getElementById("pActive").checked = true;
document.getElementById("formHeading").textContent = "Add New Product";
document.getElementById("saveProduct").textContent = "Save Product";
document.getElementById("cancelEdit").hidden = true;
}

async function saveProduct(event) {
event.preventDefault();

if (!requireAdmin()) return;

const name = document.getElementById("pName").value.trim();
const price = Number(document.getElementById("pPrice").value);
const stock = Number(document.getElementById("pStock").value);
const imageUrl = document.getElementById("pImage").value.trim();

if (!name || !imageUrl ||
!Number.isFinite(price) ||
!Number.isFinite(stock) ||
price < 0 || stock < 0) {
showMessage("Please check product name, image URL, price and stock.");
return;
}

if (!/^https?:///i.test(imageUrl)) {
showMessage("Image URL must begin with https:// or http://");
return;
}

const productData = {
name,
price,
stock,
imageUrl,
category: document.getElementById("pCategory").value.trim(),
description: document.getElementById("pDescription").value.trim(),
active: document.getElementById("pActive").checked
};

const saveButton = document.getElementById("saveProduct");
const isEditing = Boolean(editingId);

saveButton.disabled = true;
saveButton.textContent = isEditing ? "Updating..." : "Saving...";

try {
if (isEditing) {
await updateDoc(doc(db, "products", editingId), productData);
showMessage("Product updated successfully.");
} else {
await addDoc(collection(db, "products"), {
...productData,
featured: false,
discountPrice: 0,
createdAt: serverTimestamp()
});

  showMessage("Product added successfully.");
}

resetForm();
await loadProducts();

} catch (error) {
console.error("Product save error:", error);
showMessage("Product save failed: " + error.message);
alert("Product save failed:\n" + error.message);
} finally {
saveButton.disabled = false;
saveButton.textContent = editingId ? "Update Product" : "Save Product";
}
}

async function loadProducts() {
const list = document.getElementById("productsList");

if (!list || loadingProducts || !isAdmin()) return;

loadingProducts = true;
list.textContent = "Loading products...";

try {
const snapshot = await getDocs(collection(db, "products"));

productsCache = snapshot.docs.map(item => ({
  id: item.id,
  ...item.data()
}));

if (!productsCache.length) {
  list.textContent = "No products yet. Add your first product above.";
  return;
}

list.innerHTML = productsCache.map(product => `
  <article class="admin-card">
    <strong>${safe(product.name)}</strong>

    <p>
      Price: ${safe(money(product.price))} |
      Stock: ${safe(product.stock)}
    </p>

    <p>Category: ${safe(product.category || "-")}</p>

    <p>Status: ${product.active === true ? "Visible" : "Hidden"}</p>

    <button
      type="button"
      data-action="edit"
      data-id="${safe(product.id)}">
      Edit
    </button>

    <button
      type="button"
      data-action="delete"
      data-id="${safe(product.id)}">
      Delete
    </button>
  </article>
`).join("");

} catch (error) {
console.error("Load products error:", error);
list.textContent = "Could not load products: " + error.message;
} finally {
loadingProducts = false;
}
}

async function loadOrders() {
const list = document.getElementById("ordersList");

if (!list || loadingOrders || !isAdmin()) return;

loadingOrders = true;
list.textContent = "Loading orders...";

try {
// Admin can read all orders. Customer-facing pages must use ownerUid filters.
const snapshot = await getDocs(collection(db, "orders"));

const orders = snapshot.docs.map(item => ({
  id: item.id,
  ...item.data()
}));

if (!orders.length) {
  list.textContent = "No customer orders yet.";
  return;
}

orders.sort((a, b) =>
  (b.createdAt?.toMillis?.() || 0) -
  (a.createdAt?.toMillis?.() || 0)
);

const statuses = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled"
];

const paymentStatuses = [
  "unpaid",
  "unverified",
  "paid",
  "rejected"
];

const paymentLabels = {
  pending: "Not chosen yet",
  cod: "Cash on Delivery",
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket"
};

list.innerHTML = orders.map(order => {
  const status = statuses.includes(order.status)
    ? order.status
    : "pending";

  const paymentStatus = paymentStatuses.includes(order.paymentStatus)
    ? order.paymentStatus
    : "unpaid";

  const subtotal = Number(order.total);
  const deliveryFee = Number(order.deliveryFee ?? 0);

  const grandTotal = Number.isFinite(subtotal) &&
    Number.isFinite(deliveryFee)
    ? subtotal + deliveryFee
    : null;

  const method = paymentLabels[order.paymentMethod] ||
    order.paymentMethod ||
    "Not specified";

  const deadline = formatDate(order.paymentDeadline);

  return `
    <article class="admin-card">
      <p>
        <strong>Order ID:</strong><br>
        ${safe(order.id)}
      </p>

      <p><strong>Customer:</strong> ${safe(order.customerName || "-")}</p>
      <p><strong>Phone:</strong> ${safe(order.phone || "-")}</p>
      <p><strong>Address:</strong> ${safe(order.address || "-")}</p>
      <p><strong>Created:</strong> ${safe(formatDate(order.createdAt))}</p>
      <p><strong>Confirmed:</strong> ${safe(formatDate(order.confirmedAt))}</p>

      <div>
        <strong>Order Items</strong>
        ${renderOrderItems(order.items)}
      </div>

      <div class="order-summary">
        <p>
          <span>Subtotal</span>
          <strong>${safe(money(order.total))}</strong>
        </p>

        <p>
          <span>Delivery Fee</span>
          <strong>${safe(money(order.deliveryFee ?? 0))}</strong>
        </p>

        <p>
          <span>Grand Total</span>
          <strong>${grandTotal !== null ? safe(money(grandTotal)) : "—"}</strong>
        </p>
      </div>

      <div class="payment-box">
        <h4>Payment Verification</h4>

        <p><strong>Method:</strong> ${safe(method)}</p>
        <p><strong>Payment Status:</strong> ${safe(paymentStatus)}</p>
        <p><strong>Sender Number:</strong> ${safe(order.senderPhone || "Not provided")}</p>
        <p><strong>Transaction ID:</strong> ${safe(order.transactionId || "Not provided")}</p>
        <p><strong>Payment Deadline:</strong> ${safe(deadline)}</p>

        <label for="payment-${safe(order.id)}">Payment Status</label>

        <select id="payment-${safe(order.id)}">
          ${paymentStatuses.map(value => `
            <option
              value="${value}"
              ${value === paymentStatus ? "selected" : ""}>
              ${
                value === "unverified"
                  ? "Awaiting Verification"
                  : value.charAt(0).toUpperCase() + value.slice(1)
              }
            </option>
          `).join("")}
        </select>

        <p class="help-text">
          Verify the transaction in the receiving account before selecting Paid.
        </p>
      </div>

      <label for="fee-${safe(order.id)}">Delivery Fee (৳)</label>
      <input
        id="fee-${safe(order.id)}"
        type="number"
        min="0"
        step="1"
        value="${safe(order.deliveryFee ?? 0)}"
      >

      <label for="courier-${safe(order.id)}">Courier Name</label>
      <input
        id="courier-${safe(order.id)}"
        maxlength="100"
        value="${safe(order.courierName || "")}"
        placeholder="e.g. Pathao Courier"
      >

      <label for="tracking-${safe(order.id)}">Tracking Number</label>
      <input
        id="tracking-${safe(order.id)}"
        maxlength="100"
        value="${safe(order.trackingNumber || "")}"
        placeholder="Tracking number (optional)"
      >

      <label for="status-${safe(order.id)}">Order Status</label>
      <select id="status-${safe(order.id)}">
        ${statuses.map(value => `
          <option
            value="${value}"
            ${value === status ? "selected" : ""}>
            ${value.charAt(0).toUpperCase() + value.slice(1)}
          </option>
        `).join("")}
      </select>

      <p class="status-note">
        Choose <strong>Confirmed</strong> after reviewing the order and setting
        the delivery fee. The customer-facing page and Firestore Rules must
        support the later COD/payment choice.
      </p>

      <button
        type="button"
        class="save-order"
        data-save-order="${safe(order.id)}">
        Save Order & Payment Status
      </button>
    </article>
  `;
}).join("");

} catch (error) {
console.error("Load orders error:", error);
list.textContent = "Could not load orders: " + error.message;
} finally {
loadingOrders = false;
}
}

onAuthStateChanged(auth, user => {
if (user && user.uid === ADMIN_UID) {
showDashboard();
} else {
dashboard.dataset.ready = "";
showLogin();

if (user) {
  signOut(auth).catch(error => {
    console.error("Could not sign out unauthorized user:", error);
  });
}

}
});

loginForm.addEventListener("submit", async event => {
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
console.error("Admin login error:", error);
message.textContent = "Login failed: " + error.message;
} finally {
loginButton.disabled = false;
}
});