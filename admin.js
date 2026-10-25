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
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const loginMessage = document.getElementById("loginMessage");

let editingId = null;
let productsCache = [];
let ordersCache = [];
let savingSettings = false;
let savingProduct = false;
let loadingOrders = false;
let loadingProducts = false;
let refreshingDashboard = false;

const ORDER_STATUSES = [
  "pending", "confirmed", "processing",
  "shipped", "delivered", "cancelled"
];

const PAYMENT_STATUSES = ["unpaid", "unverified", "paid"];

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
    ? "৳" + amount.toLocaleString("en-BD", {
        maximumFractionDigits: 2
      })
    : "—";
}

function showMessage(text) {
  const box = document.getElementById("panelMessage");

  if (box) {
    box.textContent = text;
  } else if (loginMessage) {
    loginMessage.textContent = text;
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

function formatDate(value) {
  if (!value) return "Not set";

  let date;

  if (typeof value.toDate === "function") {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "Not set";

  return date.toLocaleString("en-BD", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function timestampMillis(value) {
  if (!value) return 0;

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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
    return '<p class="help-text">No item details available.</p>';
  }

  return `
    <div class="order-items-list">
      ${normalized.map((item, index) => {
        if (!item || typeof item !== "object") {
          return `
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

        const lineTotal = explicitTotal != null
          ? Number(explicitTotal)
          : price * quantity;

        return `
          <div class="order-item">
            <strong>${safe(name)}</strong>
            <p>Item #${index + 1}</p>
            <p>Quantity: ${safe(quantity)}</p>
            <p>Unit price: ${safe(money(price))}</p>
            ${Number.isFinite(lineTotal)
              ? `<p>Item total: <strong>${safe(money(lineTotal))}</strong></p>`
              : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function paymentMethodLabel(method) {
  return ({
    pending: "Not chosen yet",
    cod: "Cash on Delivery",
    bkash: "bKash",
    nagad: "Nagad",
    rocket: "Rocket"
  })[method] || method || "Not specified";
}

function paymentStatusLabel(status) {
  return ({
    unpaid: "Unpaid",
    unverified: "Awaiting verification",
    paid: "Paid",
    failed: "Failed",
    refunded: "Refunded"
  })[status] || status || "Unpaid";
}

function statusClass(status) {
  const allowed = [
    ...ORDER_STATUSES,
    ...PAYMENT_STATUSES,
    "failed"
  ];

  return allowed.includes(status) ? status : "pending";
}

function statusOptions(options, selected, labels = {}) {
  return options.map(value => `
    <option value="${safe(value)}"
      ${value === selected ? "selected" : ""}>
      ${safe(labels[value] || value.charAt(0).toUpperCase() + value.slice(1))}
    </option>
  `).join("");
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function showDashboard() {
  if (!isAdmin()) {
    showLogin();
    return;
  }

  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");

  if (dashboard.dataset.ready === "yes") {
    refreshAll();
    return;
  }

  dashboard.dataset.ready = "yes";

  dashboard.innerHTML = `
    <div class="app-layout">

      <aside class="sidebar" id="adminSidebar">
        <div class="sidebar-brand">
          <strong>MINHA</strong>
          <small>LADIES BAG · ADMIN</small>
        </div>

        <div class="sidebar-label">Workspace</div>

        <nav class="side-nav" aria-label="Admin navigation">
          <button type="button" class="active" data-section="overview">
            <span class="side-icon">⌂</span> Dashboard
          </button>

          <button type="button" data-section="productsSection">
            <span class="side-icon">▣</span> Products
          </button>

          <button type="button" data-section="ordersSection">
            <span class="side-icon">▤</span> Orders
          </button>

          <button type="button" data-section="paymentSection">
            <span class="side-icon">৳</span> Payments
          </button>

          <button type="button" data-section="settingsSection">
            <span class="side-icon">⚙</span> Settings
          </button>
        </nav>

        <div class="sidebar-spacer"></div>

        <div class="sidebar-footer">
          <strong>Minha Ladies Bag</strong><br>
          Store Management
        </div>
      </aside>

      <main class="main-area">
        <header class="topbar">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <button id="mobileMenuButton"
              class="mobile-menu-button"
              type="button"
              aria-label="Open navigation">☰</button>

            <div>
              <h1 id="pageTitle">Dashboard</h1>
              <p id="pageSubtitle">Your store at a glance</p>
            </div>
          </div>

          <div class="topbar-right">
            <div class="admin-avatar" aria-label="Admin account">M</div>
            <button id="logoutButton" class="logout-button" type="button">
              Logout
            </button>
          </div>
        </header>

        <p id="panelMessage" role="status" aria-live="polite"></p>

        <section id="overview">
          <div class="stats-grid">

            <article class="stat-card">
              <div class="stat-top">
                <span>Total Products</span>
                <span class="stat-icon">▣</span>
              </div>
              <div class="stat-value" id="statProducts">—</div>
              <div class="stat-note">Products in inventory</div>
            </article>

            <article class="stat-card">
              <div class="stat-top">
                <span>Total Orders</span>
                <span class="stat-icon">▤</span>
              </div>
              <div class="stat-value" id="statOrders">—</div>
              <div class="stat-note">Orders recorded in Firestore</div>
            </article>

            <article class="stat-card">
              <div class="stat-top">
                <span>Paid Revenue</span>
                <span class="stat-icon">৳</span>
              </div>
              <div class="stat-value" id="statRevenue">—</div>
              <div class="stat-note">Orders marked as paid</div>
            </article>

            <article class="stat-card">
              <div class="stat-top">
                <span>Pending Orders</span>
                <span class="stat-icon">◷</span>
              </div>
              <div class="stat-value" id="statPending">—</div>
              <div class="stat-note">Awaiting further action</div>
            </article>

          </div>

          <div class="content-grid">
            <article class="panel-card">
              <div class="panel-heading">
                <div>
                  <h2>Revenue Overview</h2>
                  <p>Monthly revenue from orders marked paid</p>
                </div>
              </div>

              <div class="chart-wrap">
                <svg id="revenueChart"
                  viewBox="0 0 520 190"
                  role="img"
                  aria-label="Monthly paid revenue chart">
                  <text x="15" y="30" fill="#8993a4" font-size="12">
                    Loading revenue data...
                  </text>
                </svg>
              </div>

              <div class="chart-legend">
                <span><i class="legend-dot"></i>Paid revenue</span>
              </div>
            </article>

            <article class="panel-card">
              <div class="panel-heading">
                <div>
                  <h2>Order Overview</h2>
                  <p>Current order status breakdown</p>
                </div>
              </div>

              <div class="status-list" id="orderOverview">
                <p class="help-text">Loading order statistics...</p>
              </div>
            </article>
          </div>

          <article class="panel-card">
            <div class="section-toolbar">
              <div>
                <h2>Recent Orders</h2>
                <p class="section-description">
                  Latest orders saved in your store.
                </p>
              </div>

              <button class="secondary-button"
                type="button" data-section="ordersSection">
                View All Orders
              </button>
            </div>

            <div id="recentOrders">
              <p class="help-text">Loading recent orders...</p>
            </div>
          </article>
        </section>

        <section class="section-panel" id="productsSection">
          <article class="panel-card">
            <div class="section-toolbar">
              <div>
                <h2 id="formHeading">Add New Product</h2>
                <p class="section-description">
                  Create and manage products displayed in your shop.
                </p>
              </div>
            </div>

            <form id="productForm">
              <div class="form-grid">
                <div>
                  <label class="form-label" for="pName">Product Name *</label>
                  <input class="dashboard-field" id="pName"
                    maxlength="120" required>
                </div>

                <div>
                  <label class="form-label" for="pPrice">Price (৳) *</label>
                  <input class="dashboard-field" id="pPrice"
                    type="number" min="0" step="1" required>
                </div>

                <div>
                  <label class="form-label" for="pStock">Stock Quantity *</label>
                  <input class="dashboard-field" id="pStock"
                    type="number" min="0" step="1" required>
                </div>

                <div>
                  <label class="form-label" for="pCategory">Category</label>
                  <input class="dashboard-field" id="pCategory">
                </div>

                <div class="full-width">
                  <label class="form-label" for="pImage">Image URL *</label>
                  <input class="dashboard-field" id="pImage"
                    type="url" placeholder="https://..." required>
                </div>

                <div class="full-width">
                  <label class="form-label" for="pDescription">Description</label>
                  <textarea class="dashboard-field"
                    id="pDescription" rows="3"></textarea>
                </div>
              </div>

              <label class="checkbox-row">
                <input id="pActive" type="checkbox" checked>
                Show this product on the website
              </label>

              <div class="form-actions">
                <button class="primary-button" id="saveProduct" type="submit">
                  Save Product
                </button>

                <button class="secondary-button" id="cancelEdit"
                  type="button" hidden>Cancel Edit</button>
              </div>
            </form>
          </article>

          <article class="panel-card">
            <div class="section-toolbar">
              <h2>Product Inventory</h2>
              <button id="refreshProducts"
                class="secondary-button" type="button">
                Refresh Products
              </button>
            </div>

            <div id="productsList" class="admin-list">
              <p class="empty-state">Loading products...</p>
            </div>
          </article>
        </section>

        <section class="section-panel" id="ordersSection">
          <article class="panel-card">
            <div class="section-toolbar">
              <div>
                <h2>Customer Orders</h2>
                <p class="section-description">
                  Manage delivery charges, courier details, order status,
                  and payment verification.
                </p>
              </div>

              <button id="refreshOrders"
                class="secondary-button" type="button">
                Refresh Orders
              </button>
            </div>

            <div id="ordersList">
              <p class="empty-state">Loading orders...</p>
            </div>
          </article>
        </section>

        <section class="section-panel" id="paymentSection">
          <article class="panel-card">
            <div>
              <h2>Payment Settings</h2>
              <p class="section-description">
                Configure the receiving numbers supplied by the store owner.
              </p>
            </div>

            <form id="paymentSettingsForm">
              <div class="form-grid">
                <div>
                  <label class="form-label" for="bkashNumber">bKash Number</label>
                  <input class="dashboard-field" id="bkashNumber"
                    type="tel" maxlength="25">
                </div>

                <div>
                  <label class="form-label" for="nagadNumber">Nagad Number</label>
                  <input class="dashboard-field" id="nagadNumber"
                    type="tel" maxlength="25">
                </div>

                <div>
                  <label class="form-label" for="rocketNumber">Rocket Number</label>
                  <input class="dashboard-field" id="rocketNumber"
                    type="tel" maxlength="25">
                </div>
              </div>

              <button class="primary-button" id="savePaymentSettings"
                type="submit" style="margin-top:18px">
                Save Payment Numbers
              </button>
            </form>
          </article>
        </section>

        <section class="section-panel" id="settingsSection">
          <article class="panel-card">
            <h2>Store Settings</h2>
            <p class="section-description">
              Store information and administration.
            </p>

            <p class="help-text">
              Signed in as the authorized Firebase administrator.
              Product, order and payment changes are saved in Firestore.
            </p>

            <button class="secondary-button" id="settingsRefresh"
              type="button">Refresh Dashboard Data</button>
          </article>
        </section>

      </main>
    </div>
  `;

  document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      showMessage("Logout failed: " + error.message);
    }
  });

  document.getElementById("mobileMenuButton").addEventListener("click", () => {
    document.getElementById("adminSidebar").classList.toggle("open");
  });

  dashboard.querySelectorAll("[data-section]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.section;
      const target = document.getElementById(id);

      if (!target) return;

      if (id === "overview") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      dashboard.querySelectorAll(".side-nav button").forEach(item => {
        item.classList.toggle("active", item.dataset.section === id);
      });

      const titles = {
        overview: ["Dashboard", "Your store at a glance"],
        productsSection: ["Products", "Manage your product inventory"],
        ordersSection: ["Orders", "Manage orders and delivery"],
        paymentSection: ["Payments", "Payment numbers and verification"],
        settingsSection: ["Settings", "Store administration"]
      };

      document.getElementById("pageTitle").textContent =
        (titles[id] || titles.overview)[0];

      document.getElementById("pageSubtitle").textContent =
        (titles[id] || titles.overview)[1];

      document.getElementById("adminSidebar").classList.remove("open");
    });
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

  document.getElementById("settingsRefresh")
    .addEventListener("click", refreshAll);

  document.getElementById("productsList").addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button || !requireAdmin()) return;

    const product = productsCache.find(item => item.id === button.dataset.id);
    if (!product) return;

    if (button.dataset.action === "edit") {
      editingId = product.id;

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

      document.getElementById("productForm").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    if (button.dataset.action === "delete") {
      if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;

      button.disabled = true;

      try {
        await deleteDoc(doc(db, "products", product.id));
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
    const paymentInput = document.getElementById("payment-" + id);

    if (!feeInput || !courierInput || !trackingInput ||
        !statusInput || !paymentInput) {
      showMessage("Order fields missing. Refresh orders and try again.");
      return;
    }

    const deliveryFee = Number(feeInput.value);
    const courierName = courierInput.value.trim();
    const trackingNumber = trackingInput.value.trim();
    const status = statusInput.value;
    const paymentStatus = paymentInput.value;

    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      showMessage("Delivery fee must be zero or a positive number.");
      return;
    }

    if (!ORDER_STATUSES.includes(status) ||
        !PAYMENT_STATUSES.includes(paymentStatus)) {
      showMessage("Invalid order or payment status.");
      return;
    }

    if (paymentStatus === "paid") {
      const currentOrder = ordersCache.find(order => order.id === id);

      if (currentOrder?.paymentStatus !== "paid" &&
          !confirm("Have you verified the transaction in the receiving account?")) {
        return;
      }
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const orderRef = doc(db, "orders", id);
      const snapshot = await getDoc(orderRef);

      if (!snapshot.exists()) {
        throw new Error("This order no longer exists.");
      }

      const order = snapshot.data();
      const subtotal = Number(order.total);

      if (!Number.isFinite(subtotal) || subtotal < 0) {
        throw new Error("The order subtotal is invalid.");
      }

      const changes = {
        deliveryFee,
        grandTotal: subtotal + deliveryFee,
        courierName,
        trackingNumber,
        status,
        paymentStatus,
        updatedAt: serverTimestamp()
      };

      if (status === "confirmed" && !order.confirmedAt) {
        changes.confirmedAt = serverTimestamp();
      }

      if (
        status === "confirmed" &&
        order.paymentMethod !== "cod" &&
        !order.paymentDeadline
      ) {
        changes.paymentRequestedAt = serverTimestamp();
        changes.paymentDeadline = Timestamp.fromDate(
          new Date(Date.now() + PAYMENT_WINDOW_MS)
        );
      }

      if (paymentStatus === "paid" && order.paymentStatus !== "paid") {
        changes.paidAt = serverTimestamp();
      }

      if (status === "cancelled" && order.status !== "cancelled") {
        changes.cancelledAt = serverTimestamp();
      }

      if (order.paymentStatus === "paid" && paymentStatus !== "paid") {
        if (!confirm("This order is already marked Paid. Change the status?")) {
          return;
        }
      }

      await updateDoc(orderRef, changes);

      showMessage("Order details saved successfully.");
      await loadOrders();
    } catch (error) {
      console.error("Order update error:", error);
      showMessage("Order update failed: " + error.message);
      alert("Order update failed:\n" + error.message);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  refreshAll();
}

async function refreshAll() {
  if (!requireAdmin() || refreshingDashboard) return;

  refreshingDashboard = true;

  try {
    await Promise.all([
      loadPaymentSettings(),
      loadProducts(),
      loadOrders()
    ]);
  } finally {
    refreshingDashboard = false;
  }
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

  const button = document.getElementById("savePaymentSettings");

  savingSettings = true;
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await setDoc(doc(db, "settings", "payment"), {
      bkashNumber,
      nagadNumber,
      rocketNumber,
      updatedAt: serverTimestamp()
    }, { merge: true });

    const check = await getDoc(doc(db, "settings", "payment"));

    if (!check.exists()) {
      throw new Error("Saved settings could not be verified.");
    }

    const saved = check.data();

    if (
      (saved.bkashNumber || "") !== bkashNumber ||
      (saved.nagadNumber || "") !== nagadNumber ||
      (saved.rocketNumber || "") !== rocketNumber
    ) {
      throw new Error("Saved values do not match the entered numbers.");
    }

    showMessage("Payment numbers saved successfully.");
    alert("Payment numbers saved successfully.");
  } catch (error) {
    console.error("Payment settings error:", error);
    showMessage("Could not save payment numbers: " + error.message);
    alert("Could not save payment numbers:\n" + error.message);
  } finally {
    savingSettings = false;
    button.disabled = false;
    button.textContent = "Save Payment Numbers";
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

  if (savingProduct || !requireAdmin()) return;

  const name = document.getElementById("pName").value.trim();
  const price = Number(document.getElementById("pPrice").value);
  const stock = Number(document.getElementById("pStock").value);
  const imageUrl = document.getElementById("pImage").value.trim();

  if (
    !name || !imageUrl ||
    !Number.isFinite(price) ||
    !Number.isFinite(stock) ||
    price < 0 || stock < 0
  ) {
    showMessage("Check product name, image URL, price and stock.");
    return;
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    showMessage("Image URL must start with https:// or http://");
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

  const button = document.getElementById("saveProduct");
  const wasEditing = Boolean(editingId);
  const currentId = editingId;

  savingProduct = true;
  button.disabled = true;
  button.textContent = wasEditing ? "Updating..." : "Saving...";

  try {
    if (wasEditing) {
      await updateDoc(doc(db, "products", currentId), productData);
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
    console.error("Save product error:", error);
    showMessage("Product save failed: " + error.message);
    alert("Product save failed:\n" + error.message);
  } finally {
    savingProduct = false;
    button.disabled = false;
    button.textContent = editingId ? "Update Product" : "Save Product";
  }
}

async function loadProducts() {
  const list = document.getElementById("productsList");

  if (!list || loadingProducts || !isAdmin()) return;

  loadingProducts = true;
  list.innerHTML = '<p class="empty-state">Loading products...</p>';

  try {
    const snapshot = await getDocs(collection(db, "products"));

    productsCache = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    const activeProducts = productsCache.filter(
      product => product.active === true
    );

    document.getElementById("statProducts").textContent =
      productsCache.length.toLocaleString("en-BD");

    if (!productsCache.length) {
      list.innerHTML = '<p class="empty-state">No products yet. Add your first product above.</p>';
      return;
    }

    list.innerHTML = productsCache.map(product => `
      <article class="item-card">
        <h3>${safe(product.name || "Unnamed product")}</h3>

        <p><strong>Price:</strong> ${safe(money(product.price))}</p>
        <p><strong>Stock:</strong> ${safe(product.stock ?? 0)}</p>
        <p><strong>Category:</strong> ${safe(product.category || "-")}</p>
        <p><strong>Visibility:</strong>
          ${product.active === true ? "Visible" : "Hidden"}
        </p>

        <div class="item-actions">
          <button class="edit-button" type="button"
            data-action="edit" data-id="${safe(product.id)}">
            Edit
          </button>

          <button class="delete-button" type="button"
            data-action="delete" data-id="${safe(product.id)}">
            Delete
          </button>
        </div>
      </article>
    `).join("");

    showMessage(
      `${productsCache.length} products loaded (${activeProducts.length} visible).`
    );
  } catch (error) {
    console.error("Load products error:", error);
    list.innerHTML = `
      <p class="empty-state">
        Could not load products: ${safe(error.message)}
      </p>
    `;
  } finally {
    loadingProducts = false;
  }
}

function getOrderSubtotal(order) {
  const value = Number(order.total);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function getGrandTotal(order) {
  if (order.grandTotal != null && Number.isFinite(Number(order.grandTotal))) {
    return Number(order.grandTotal);
  }

  return getOrderSubtotal(order) + Math.max(0, Number(order.deliveryFee) || 0);
}

function updateOrderStatistics() {
  const total = ordersCache.length;

  const pending = ordersCache.filter(order =>
    ["pending", "confirmed", "processing"].includes(order.status)
  ).length;

  const paidOrders = ordersCache.filter(
    order => order.paymentStatus === "paid"
  );

  const revenue = paidOrders.reduce(
    (sum, order) => sum + getGrandTotal(order),
    0
  );

  document.getElementById("statOrders").textContent =
    total.toLocaleString("en-BD");

  document.getElementById("statPending").textContent =
    pending.toLocaleString("en-BD");

  document.getElementById("statRevenue").textContent = money(revenue);

  renderOrderOverview();
  renderRevenueChart();
  renderRecentOrders();
}

function renderOrderOverview() {
  const box = document.getElementById("orderOverview");
  if (!box) return;

  const statuses = [
    { key: "pending", label: "Pending", color: "orange" },
    { key: "processing", label: "Processing", color: "" },
    { key: "shipped", label: "Shipped", color: "green" },
    { key: "delivered", label: "Delivered", color: "green" },
    { key: "cancelled", label: "Cancelled", color: "red" }
  ];

  if (!ordersCache.length) {
    box.innerHTML = '<p class="help-text">No order statistics available yet.</p>';
    return;
  }

  box.innerHTML = statuses.map(item => {
    const count = ordersCache.filter(order => order.status === item.key).length;
    const percent = Math.round(count / ordersCache.length * 100);

    return `
      <div>
        <div class="status-row">
          <span>${safe(item.label)}</span>
          <strong>${count} (${percent}%)</strong>
        </div>

        <div class="progress-track">
          <div class="progress-fill ${item.color}"
            style="width:${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderRevenueChart() {
  const svg = document.getElementById("revenueChart");
  if (!svg) return;

  const now = new Date();
  const months = [];

  for (let offset = 5; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);

    months.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      label: date.toLocaleDateString("en", { month: "short" }),
      value: 0
    });
  }

  ordersCache.forEach(order => {
    if (order.paymentStatus !== "paid") return;

    const time = timestampMillis(order.paidAt || order.createdAt);
    if (!time) return;

    const date = new Date(time);
    const bucket = months.find(item =>
      item.year === date.getFullYear() &&
      item.month === date.getMonth()
    );

    if (bucket) bucket.value += getGrandTotal(order);
  });

  const maxValue = Math.max(...months.map(item => item.value), 1);
  const chartLeft = 48;
  const chartRight = 505;
  const chartTop = 16;
  const chartBottom = 146;
  const chartHeight = chartBottom - chartTop;
  const chartWidth = chartRight - chartLeft;

  const gridLines = [0, 1, 2, 3].map(index => {
    const y = chartTop + index * chartHeight / 3;
    const value = maxValue * (1 - index / 3);

    return `
      <line x1="${chartLeft}" y1="${y}"
        x2="${chartRight}" y2="${y}"
        stroke="#e9edf4" stroke-dasharray="3 4"/>

      <text x="${chartLeft - 8}" y="${y + 4}"
        fill="#8993a4" font-size="9" text-anchor="end">
        ${safe(value >= 1000
          ? (value / 1000).toFixed(value >= 10000 ? 0 : 1) + "k"
          : Math.round(value))}
      </text>
    `;
  }).join("");

  const points = months.map((item, index) => {
    const x = chartLeft + index * chartWidth / (months.length - 1);
    const y = chartBottom - (item.value / maxValue) * chartHeight;

    return {
      x,
      y,
      item
    };
  });

  const line = points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
  ).join(" ");

  const area = `${line} L ${chartRight} ${chartBottom} L ${chartLeft} ${chartBottom} Z`;

  svg.innerHTML = `
    ${gridLines}

    <path d="${area}" fill="#0866f5" opacity=".09"></path>

    <path d="${line}" fill="none"
      stroke="#0866f5" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"></path>

    ${points.map(point => `
      <circle cx="${point.x}" cy="${point.y}" r="3.5"
        fill="#ffffff" stroke="#0866f5" stroke-width="2">
        <title>${safe(point.item.label)}: ${safe(money(point.item.value))}</title>
      </circle>

      <text x="${point.x}" y="169"
        fill="#8993a4" font-size="10" text-anchor="middle">
        ${safe(point.item.label)}
      </text>
    `).join("")}
  `;
}

function renderRecentOrders() {
  const box = document.getElementById("recentOrders");
  if (!box) return;

  if (!ordersCache.length) {
    box.innerHTML = '<p class="empty-state">No customer orders yet.</p>';
    return;
  }

  box.innerHTML = ordersCache.slice(0, 5).map(order => `
    <article class="item-card" style="margin-bottom:10px">
      <div class="order-card-head">
        <div>
          <h3>Order #${safe(order.id)}</h3>
          <p>${safe(formatDate(order.createdAt))}</p>
        </div>

        <span class="status-pill ${safe(statusClass(order.status))}">
          ${safe(order.status || "pending")}
        </span>
      </div>

      <p><strong>Customer:</strong> ${safe(order.customerName || "-")}</p>
      <p><strong>Total:</strong> ${safe(money(getGrandTotal(order)))}</p>
      <p><strong>Payment:</strong> ${safe(paymentStatusLabel(order.paymentStatus))}</p>
    </article>
  `).join("");
}

async function loadOrders() {
  const list = document.getElementById("ordersList");

  if (!list || loadingOrders || !isAdmin()) return;

  loadingOrders = true;
  list.innerHTML = '<p class="empty-state">Loading orders...</p>';

  try {
    const snapshot = await getDocs(collection(db, "orders"));

    ordersCache = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    ordersCache.sort((a, b) =>
      timestampMillis(b.createdAt) - timestampMillis(a.createdAt)
    );

    updateOrderStatistics();

    if (!ordersCache.length) {
      list.innerHTML = '<p class="empty-state">No customer orders yet.</p>';
      return;
    }

    list.innerHTML = ordersCache.map(order => {
      const status = ORDER_STATUSES.includes(order.status)
        ? order.status
        : "pending";

      const paymentStatus = PAYMENT_STATUSES.includes(order.paymentStatus)
        ? order.paymentStatus
        : "unpaid";

      return `
        <article class="order-card">
          <div class="order-card-head">
            <div>
              <h3>Order #${safe(order.id)}</h3>
              <p>Created: ${safe(formatDate(order.createdAt))}</p>
            </div>

            <span class="status-pill ${safe(statusClass(status))}">
              ${safe(status)}
            </span>
          </div>

          <div class="order-details-grid">
            <div>
              <span class="detail-label">Customer</span>
              <span class="detail-value">${safe(order.customerName || "-")}</span>
            </div>

            <div>
              <span class="detail-label">Phone</span>
              <span class="detail-value">${safe(order.phone || "-")}</span>
            </div>

            <div>
              <span class="detail-label">Address</span>
              <span class="detail-value">${safe(order.address || "-")}</span>
            </div>

            <div>
              <span class="detail-label">Confirmed</span>
              <span class="detail-value">${safe(formatDate(order.confirmedAt))}</span>
            </div>
          </div>

          <div class="order-box">
            <h4>Order Items</h4>
            ${renderOrderItems(order.items)}
          </div>

          <div class="order-box">
            <h4>Order Summary</h4>

            <div class="summary-line">
              <span>Subtotal</span>
              <strong>${safe(money(order.total))}</strong>
            </div>

            <div class="summary-line">
              <span>Delivery Fee</span>
              <strong>${safe(money(order.deliveryFee ?? 0))}</strong>
            </div>

            <div class="summary-line total">
              <span>Grand Total</span>
              <strong>${safe(money(getGrandTotal(order)))}</strong>
            </div>
          </div>

          <div class="order-box">
            <h4>Payment Verification</h4>

            <p>
              <span class="detail-label">Payment method</span>
              <span class="detail-value">${safe(paymentMethodLabel(order.paymentMethod))}</span>
            </p>

            <p>
              <span class="detail-label">Payment status</span>
              <span class="status-pill ${safe(statusClass(paymentStatus))}">
                ${safe(paymentStatusLabel(paymentStatus))}
              </span>
            </p>

            <p>
              <span class="detail-label">Sender number</span>
              <span class="detail-value">${safe(order.senderPhone || "Not provided")}</span>
            </p>

            <p>
              <span class="detail-label">Transaction ID</span>
              <span class="detail-value">${safe(order.transactionId || "Not provided")}</span>
            </p>

            <p>
              <span class="detail-label">Payment deadline</span>
              <span class="detail-value">${safe(formatDate(order.paymentDeadline))}</span>
            </p>

            <label class="form-label" for="payment-${safe(order.id)}">
              Payment Status
            </label>

            <select class="dashboard-field" id="payment-${safe(order.id)}">
              ${statusOptions(PAYMENT_STATUSES, paymentStatus, {
                unpaid: "Unpaid",
                unverified: "Awaiting verification",
                paid: "Paid"
              })}
            </select>

            <p class="help-text">
              Verify the transaction in the receiving account before marking Paid.
            </p>
          </div>

          <div class="form-grid">
            <div>
              <label class="form-label" for="fee-${safe(order.id)}">
                Delivery Fee (৳)
              </label>

              <input class="dashboard-field"
                id="fee-${safe(order.id)}"
                type="number" min="0" step="1"
                value="${safe(order.deliveryFee ?? 0)}">
            </div>

            <div>
              <label class="form-label" for="courier-${safe(order.id)}">
                Courier Name
              </label>

              <input class="dashboard-field"
                id="courier-${safe(order.id)}"
                maxlength="100"
                value="${safe(order.courierName || "")}">
            </div>

            <div>
              <label class="form-label" for="tracking-${safe(order.id)}">
                Tracking Number
              </label>

              <input class="dashboard-field"
                id="tracking-${safe(order.id)}"
                maxlength="100"
                value="${safe(order.trackingNumber || "")}">
            </div>

            <div>
              <label class="form-label" for="status-${safe(order.id)}">
                Order Status
              </label>

              <select class="dashboard-field" id="status-${safe(order.id)}">
                ${statusOptions(ORDER_STATUSES, status)}
              </select>
            </div>
          </div>

          <p class="help-text">
            Set the delivery fee before confirming an order.
            Online payment deadlines are created when an eligible order
            is confirmed for the first time.
          </p>

          <button class="primary-button"
            type="button"
            data-save-order="${safe(order.id)}"
            style="width:100%;margin-top:12px">
            Save Order & Payment Status
          </button>
        </article>
      `;
    }).join("");
  } catch (error) {
    console.error("Load orders error:", error);

    list.innerHTML = `
      <p class="empty-state">
        Could not load orders: ${safe(error.message)}
      </p>
    `;
  } finally {
    loadingOrders = false;
  }
}

onAuthStateChanged(auth, user => {
  if (user && user.uid === ADMIN_UID) {
    showDashboard();
    return;
  }

  dashboard.dataset.ready = "";
  showLogin();

  if (user) {
    signOut(auth).catch(error => {
      console.error("Could not sign out unauthorized user:", error);
    });
  }
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (loginButton.disabled) return;

  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";
  loginMessage.textContent = "Signing in...";

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

    loginMessage.textContent = "Login successful.";
    showDashboard();
  } catch (error) {
    console.error("Admin login error:", error);

    const friendlyMessages = {
      "auth/invalid-email": "Email address is invalid.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/too-many-requests": "Too many attempts. Try again later.",
      "auth/network-request-failed": "Network error. Check your internet connection."
    };

    loginMessage.textContent =
      "Login failed: " +
      (friendlyMessages[error.code] || error.message);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Login to Admin";
  }
});