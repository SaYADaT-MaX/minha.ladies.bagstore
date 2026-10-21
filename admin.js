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

function showMessage(text) {
  const box = document.getElementById("panelMessage");
  if (box) box.textContent = text;
  else if (message) message.textContent = text;
}

function showLogin() {
  loginForm.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function showDashboard() {
  loginForm.classList.add("hidden");
  dashboard.classList.remove("hidden");

  if (dashboard.dataset.ready === "yes") return;
  dashboard.dataset.ready = "yes";

  dashboard.innerHTML = `
    <div style="text-align:left">
      <h2>MINHA Admin Panel</h2>
      <button id="logoutButton" type="button">Logout</button>
      <p id="panelMessage" role="status"></p>

      <hr>
      <h3 id="formHeading">Add New Product</h3>

      <form id="productForm">
        <label>Product Name *</label>
        <input id="pName" required maxlength="120">

        <label>Price (৳) *</label>
        <input id="pPrice" type="number" min="0" step="1" required>

        <label>Stock Quantity *</label>
        <input id="pStock" type="number" min="0" step="1" required>

        <label>Image URL *</label>
        <input id="pImage" type="url" required placeholder="https://example.com/bag.jpg">

        <label>Category</label>
        <input id="pCategory" placeholder="Handbags">

        <label>Description</label>
        <textarea id="pDescription" rows="3"></textarea>

        <label>
          <input id="pActive" type="checkbox" checked>
          Show this product on the website
        </label>

        <br><br>
        <button id="saveProduct" type="submit">Save Product</button>
        <button id="cancelEdit" type="button" hidden>Cancel Edit</button>
      </form>

      <hr>
      <h3>Products</h3>
      <button id="refreshProducts" type="button">Refresh Products</button>
      <div id="productsList">Loading products...</div>

      <hr>
      <h3>Customer Orders</h3>
      <p>Edit an order's delivery fee and courier details, then save the changes.</p>
      <button id="refreshOrders" type="button">Refresh Orders</button>
      <div id="ordersList">Loading orders...</div>
    </div>
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
      <article style="border:1px solid #ddd;border-radius:10px;padding:12px;margin:12px 0">
        <strong>${safe(product.name)}</strong>
        <p>Price: ৳${safe(product.price)} | Stock: ${safe(product.stock)}</p>
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

    const statuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

    list.innerHTML = orders.map(order => {
      const status = statuses.includes(order.status) ? order.status : "pending";

      return `
        <article style="border:1px solid #eadde3;border-radius:12px;padding:14px;margin:12px 0">
          <strong>Order ID:</strong> ${safe(order.id)}
          <p><strong>Customer:</strong> ${safe(order.customerName)}</p>
          <p><strong>Phone:</strong> ${safe(order.phone)}</p>
          <p><strong>Address:</strong> ${safe(order.address)}</p>
          <p><strong>Items:</strong> ${safe(JSON.stringify(order.items || []))}</p>
          <p><strong>Subtotal:</strong> ৳${safe(order.total)}</p>

          <label for="fee-${safe(order.id)}">Delivery Fee (৳)</label>
          <input id="fee-${safe(order.id)}" type="number" min="0" step="1"
            value="${safe(order.deliveryFee ?? 0)}" style="width:100%;box-sizing:border-box;padding:9px">

          <label for="courier-${safe(order.id)}">Courier Name</label>
          <input id="courier-${safe(order.id)}" maxlength="100"
            value="${safe(order.courierName || "")}" placeholder="e.g. Pathao Courier"
            style="width:100%;box-sizing:border-box;padding:9px">

          <label for="tracking-${safe(order.id)}">Tracking Number</label>
          <input id="tracking-${safe(order.id)}" maxlength="100"
            value="${safe(order.trackingNumber || "")}" placeholder="Tracking number (optional)"
            style="width:100%;box-sizing:border-box;padding:9px">

          <label for="status-${safe(order.id)}">Order Status</label>
          <select id="status-${safe(order.id)}" style="width:100%;padding:9px">
            ${statuses.map(value => `
              <option value="${value}" ${value === status ? "selected" : ""}>${value}</option>
            `).join("")}
          </select>

          <button type="button" data-save-order="${safe(order.id)}"
            style="margin-top:12px;padding:10px 14px;cursor:pointer">
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