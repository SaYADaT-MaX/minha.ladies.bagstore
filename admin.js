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
  serverTimestamp
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

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
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
  if (box) box.textContent = text;
  else if (message) message.textContent = text;
}

function showLogin() {
  loginForm.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function getOrderItems(items) {
  if (Array.isArray(items)) return items;
  if (items && typeof items === "object") return Object.values(items);
  if (items) return [{ name: String(items) }];
  return [];
}

/* Display order items as neat, responsive cards */
function renderOrderItems(items) {
  const normalized = getOrderItems(items);

  if (!normalized.length) {
    return `<p class="items-empty">No item details available.</p>`;
  }

  return `
    <div class="order-items-list">
      ${normalized.map((item, index) => {
        if (!item || typeof item !== "object") {
          return `
            <div class="order-item">
              <div class="item-name">${safe(item ?? "Product")}</div>
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

        const hasPrice = Number.isFinite(price);
        const hasQuantity = Number.isFinite(quantity);
        const calculatedTotal = hasPrice && hasQuantity
          ? price * quantity
          : null;

        const lineTotal = explicitTotal != null
          ? Number(explicitTotal)
          : calculatedTotal;

        return `
          <div class="order-item">
            <div class="item-top">
              <strong class="item-name">${safe(name)}</strong>
              <span class="item-number">#${index + 1}</span>
            </div>

            <div class="item-meta">
              <span>Qty: <strong>${hasQuantity ? safe(quantity) : "—"}</strong></span>
              <span>Unit price: <strong>${hasPrice ? safe(money(price)) : "—"}</strong></span>
            </div>

            ${Number.isFinite(lineTotal) ? `
              <div class="item-total">
                Item total: <strong>${safe(money(lineTotal))}</strong>
              </div>
            ` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function showDashboard() {
  loginForm.classList.add("hidden");
  dashboard.classList.remove("hidden");

  if (dashboard.dataset.ready === "yes") return;
  dashboard.dataset.ready = "yes";

  dashboard.innerHTML = `
    <style>
      #dashboard {
        width: 100%;
        min-width: 0;
        max-width: 100%;
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
        max-width: none;
      }

      #dashboard label {
        display: block;
        margin: 12px 0 6px;
        font-weight: 600;
      }

      #dashboard button {
        max-width: 100%;
        overflow-wrap: anywhere;
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

      #dashboard .admin-list {
        min-width: 0;
        width: 100%;
      }

      #dashboard .admin-card {
        width: 100%;
        min-width: 0;
        max-width: 100%;
        padding: 14px;
        margin: 14px 0;
        border: 1px solid #eadde3;
        border-radius: 12px;
        background: #fff;
        overflow: hidden;
        overflow-wrap: anywhere;
      }

      #dashboard .admin-card p {
        margin: 9px 0;
        line-height: 1.55;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      #dashboard .order-items-list {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        width: 100%;
        min-width: 0;
        margin-top: 10px;
      }

      #dashboard .order-item {
        width: 100%;
        min-width: 0;
        padding: 12px;
        border: 1px solid #eadde3;
        border-radius: 9px;
        background: #fcf8fa;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      #dashboard .item-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
      }

      #dashboard .item-name {
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
        line-height: 1.5;
      }

      #dashboard .item-number {
        flex-shrink: 0;
        font-size: 12px;
        color: #766771;
      }

      #dashboard .item-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        margin-top: 10px;
        font-size: 13px;
        color: #66535d;
      }

      #dashboard .item-meta span {
        overflow-wrap: anywhere;
      }

      #dashboard .item-total {
        margin-top: 10px;
        padding-top: 9px;
        border-top: 1px solid #eadde3;
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 6px;
        font-size: 14px;
      }

      #dashboard .items-empty {
        padding: 10px;
        background: #fcf8fa;
        border-radius: 8px;
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

      #dashboard .order-summary strong {
        overflow-wrap: anywhere;
      }

      #dashboard .save-order {
        width: 100%;
        padding: 12px;
        margin-top: 14px;
        border: 0;
        border-radius: 8px;
        background: #8b315c;
        color: #fff;
        font-weight: 700;
        cursor: pointer;
      }

      #dashboard .save-order:disabled {
        opacity: .6;
        cursor: wait;
      }

      #dashboard .admin-card button {
        margin-top: 10px;
        padding: 10px 14px;
        cursor: pointer;
      }

      #dashboard .admin-divider {
        margin: 22px 0;
        border: 0;
        border-top: 1px solid #eadde3;
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

        #dashboard .item-meta {
          gap: 8px;
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
      <h3 id="formHeading">Add New Product</h3>

      <form id="productForm">
        <label for="pName">Product Name *</label>
        <input id="pName" required maxlength="120">

        <label for="pPrice">Price (৳) *</label>
        <input id="pPrice" type="number" min="0" step="1" required>

        <label for="pStock">Stock Quantity *</label>
        <input id="pStock" type="number" min="0" step="1" required>

        <label for="pImage">Image URL *</label>
        <input id="pImage" type="url" required placeholder="https://example.com/bag.jpg">

        <label for="pCategory">Category</label>
        <input id="pCategory" placeholder="Handbags">

        <label for="pDescription">Description</label>
        <textarea id="pDescription" rows="3"></textarea>

        <label>
          <input id="pActive" type="checkbox" checked>
          Show this product on the website
        </label>

        <br><br>
        <button id="saveProduct" type="submit">Save Product</button>
        <button id="cancelEdit" type="button" hidden>Cancel Edit</button>
      </form>
    </section>

    <hr class="admin-divider">

    <section class="admin-section">
      <h3>Products</h3>
      <button id="refreshProducts" type="button">Refresh Products</button>
      <div id="productsList" class="admin-list">Loading products...</div>
    </section>

    <hr class="admin-divider">

    <section class="admin-section">
      <h3>Customer Orders</h3>
      <p>Edit an order's delivery fee and courier details, then save the changes.</p>
      <button id="refreshOrders" type="button">Refresh Orders</button>
      <div id="ordersList" class="admin-list">Loading orders...</div>
    </section>
  `;

  document.getElementById("logoutButton").addEventListener("click", async () => {
    await signOut(auth);
    dashboard.dataset.ready = "";
    passwordInput.value = "";
    showLogin();
  });

  document.getElementById("productForm").addEventListener("submit", saveProduct);
  document.getElementById("cancelEdit").addEventListener("click", resetForm);
  document.getElementById("refreshProducts").addEventListener("click", loadProducts);
  document.getElementById("refreshOrders").addEventListener("click", loadOrders);

  document.getElementById("productsList").addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

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
      if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;

      try {
        await deleteDoc(doc(db, "products", id));
        showMessage("Product deleted successfully.");
        await loadProducts();
      } catch (error) {
        showMessage("Delete failed: " + error.message);
      }
    }
  });

  document.getElementById("ordersList").addEventListener("click", async event => {
    const button = event.target.closest("button[data-save-order]");
    if (!button) return;

    const id = button.dataset.saveOrder;
    const feeInput = document.getElementById("fee-" + id);
    const courierInput = document.getElementById("courier-" + id);
    const trackingInput = document.getElementById("tracking-" + id);
    const statusInput = document.getElementById("status-" + id);

    if (!feeInput || !courierInput || !trackingInput || !statusInput) {
      showMessage("Could not find the order fields. Refresh orders and try again.");
      return;
    }

    const deliveryFee = Number(feeInput.value);
    const courierName = courierInput.value.trim();
    const trackingNumber = trackingInput.value.trim();
    const status = statusInput.value;

    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      showMessage("Delivery fee must be zero or a positive number.");
      return;
    }

    button.disabled = true;

    try {
      await updateDoc(doc(db, "orders", id), {
        deliveryFee,
        courierName,
        trackingNumber,
        status,
        updatedAt: serverTimestamp()
      });

      showMessage("Order details updated successfully.");
      await loadOrders();
    } catch (error) {
      showMessage("Order update failed: " + error.message);
    } finally {
      button.disabled = false;
    }
  });

  loadProducts();
  loadOrders();
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

  const name = document.getElementById("pName").value.trim();
  const price = Number(document.getElementById("pPrice").value);
  const stock = Number(document.getElementById("pStock").value);
  const imageUrl = document.getElementById("pImage").value.trim();

  if (!name || !imageUrl || !Number.isFinite(price) ||
      !Number.isFinite(stock) || price < 0 || stock < 0) {
    showMessage("Please check product name, image URL, price and stock.");
    return;
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
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
  saveButton.disabled = true;

  try {
    if (editingId) {
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
    showMessage("Save failed: " + error.message);
  } finally {
    saveButton.disabled = false;
  }
}

async function loadProducts() {
  const list = document.getElementById("productsList");
  if (!list) return;

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
        <p>Price: ${safe(money(product.price))} | Stock: ${safe(product.stock)}</p>
        <p>Category: ${safe(product.category || "-")}</p>
        <p>Status: ${product.active === true ? "Visible" : "Hidden"}</p>
        <button type="button" data-action="edit" data-id="${safe(product.id)}">Edit</button>
        <button type="button" data-action="delete" data-id="${safe(product.id)}">Delete</button>
      </article>
    `).join("");
  } catch (error) {
    list.textContent = "Could not load products: " + error.message;
  }
}

async function loadOrders() {
  const list = document.getElementById("ordersList");
  if (!list) return;

  list.textContent = "Loading orders...";

  try {
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
      (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );

    const statuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled"
    ];

    list.innerHTML = orders.map(order => {
      const status = statuses.includes(order.status)
        ? order.status
        : "pending";

      const subtotal = Number(order.total);
      const deliveryFee = Number(order.deliveryFee ?? 0);
      const grandTotal = Number.isFinite(subtotal)
        ? subtotal + (Number.isFinite(deliveryFee) ? deliveryFee : 0)
        : null;

      return `
        <article class="admin-card">
          <div>
            <strong>Order ID:</strong>
            <span>${safe(order.id)}</span>
          </div>

          <p><strong>Customer:</strong> ${safe(order.customerName || "-")}</p>
          <p><strong>Phone:</strong> ${safe(order.phone || "-")}</p>
          <p><strong>Address:</strong> ${safe(order.address || "-")}</p>

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

          <label for="fee-${safe(order.id)}">Delivery Fee (৳)</label>
          <input
            id="fee-${safe(order.id)}"
            type="number"
            min="0"
            step="1"
            value="${safe(order.deliveryFee ?? 0)}">

          <label for="courier-${safe(order.id)}">Courier Name</label>
          <input
            id="courier-${safe(order.id)}"
            maxlength="100"
            value="${safe(order.courierName || "")}"
            placeholder="e.g. Pathao Courier">

          <label for="tracking-${safe(order.id)}">Tracking Number</label>
          <input
            id="tracking-${safe(order.id)}"
            maxlength="100"
            value="${safe(order.trackingNumber || "")}"
            placeholder="Tracking number (optional)">

          <label for="status-${safe(order.id)}">Order Status</label>
          <select id="status-${safe(order.id)}">
            ${statuses.map(value => `
              <option value="${value}" ${value === status ? "selected" : ""}>
                ${value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            `).join("")}
          </select>

          <button
            type="button"
            class="save-order"
            data-save-order="${safe(order.id)}">
            Save Order Details
          </button>
        </article>
      `;
    }).join("");
  } catch (error) {
    list.textContent = "Could not load orders: " + error.message;
  }
}

onAuthStateChanged(auth, user => {
  if (user && user.uid === ADMIN_UID) {
    showDashboard();
  } else {
    if (user) signOut(auth);
    dashboard.dataset.ready = "";
    showLogin();
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
    message.textContent = "Login failed: " + error.message;
  } finally {
    loginButton.disabled = false;
  }
});