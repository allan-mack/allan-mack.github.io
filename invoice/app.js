/* ============================================================
   InvoiceFox  —  client-side invoice generator
   Everything runs in the browser; nothing is uploaded anywhere.
   ============================================================ */
(function () {
    "use strict";

    /* ----------------------------------------------------------
       CONFIG  —  paste your own IDs to go live (see README.md)
       ---------------------------------------------------------- */
    const CONFIG = {
        // Stripe Payment Link for the $12 Pro unlock.
        // Set its success URL to: <your-site>/invoice/?unlocked=1
        stripePaymentLink: "",

        // Code customers enter to unlock Pro after paying.
        // (Soft, client-side gate — see README for the honest tradeoffs.)
        unlockCode: "FOX-PRO-2024",

        priceLabel: "$12"
    };

    const LS = {
        pro: "invoicefox_pro",
        profile: "invoicefox_profile"
    };

    /* ---------------------------------------------------------- */
    const $ = (id) => document.getElementById(id);
    const money = (n, sym) =>
        sym + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const state = {
        items: [],
        logo: "",
        pro: localStorage.getItem(LS.pro) === "1"
    };

    /* ===================== LINE ITEMS ===================== */
    function addItem(desc = "", qty = 1, rate = 0) {
        const id = "it" + Math.random().toString(36).slice(2, 8);
        state.items.push({ id, desc, qty, rate });
        renderItemRows();
        render();
    }

    function removeItem(id) {
        state.items = state.items.filter((i) => i.id !== id);
        renderItemRows();
        render();
    }

    function renderItemRows() {
        const wrap = $("items");
        wrap.innerHTML = "";
        state.items.forEach((it) => {
            const row = document.createElement("div");
            row.className = "item-row";
            row.innerHTML =
                '<input class="inp" placeholder="Description" value="' + esc(it.desc) + '" data-f="desc">' +
                '<input class="inp ta-r" type="number" min="0" step="any" value="' + it.qty + '" data-f="qty">' +
                '<input class="inp ta-r" type="number" min="0" step="any" value="' + it.rate + '" data-f="rate">' +
                '<button class="item-del" title="Remove">×</button>';
            row.querySelectorAll("input").forEach((inp) => {
                inp.addEventListener("input", () => {
                    const f = inp.getAttribute("data-f");
                    it[f] = f === "desc" ? inp.value : parseFloat(inp.value) || 0;
                    render();
                });
            });
            row.querySelector(".item-del").addEventListener("click", () => removeItem(it.id));
            wrap.appendChild(row);
        });
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    /* ===================== RENDER PREVIEW ===================== */
    function render() {
        const sym = $("meta-currency").value;

        // header / parties
        setText("pv-from-name", $("from-name").value || "Your business name");
        setText("pv-from-email", $("from-email").value);
        setText("pv-from-address", $("from-address").value);
        setText("pv-to-name", $("to-name").value || "Client name");
        setText("pv-to-email", $("to-email").value);
        setText("pv-to-address", $("to-address").value);
        setText("pv-number", $("meta-number").value);
        setText("pv-date", fmtDate($("meta-date").value));
        setText("pv-due", fmtDate($("meta-due").value));

        // logo
        const pvLogo = $("pv-logo");
        if (state.logo) {
            pvLogo.src = state.logo;
            pvLogo.classList.remove("hidden");
        } else {
            pvLogo.classList.add("hidden");
        }

        // items
        const body = $("pv-items");
        body.innerHTML = "";
        let subtotal = 0;
        state.items.forEach((it) => {
            const amt = (it.qty || 0) * (it.rate || 0);
            subtotal += amt;
            const tr = document.createElement("tr");
            tr.innerHTML =
                '<td class="ta-l">' + esc(it.desc || "—") + "</td>" +
                '<td class="ta-r">' + (it.qty || 0) + "</td>" +
                '<td class="ta-r">' + money(it.rate, sym) + "</td>" +
                '<td class="ta-r">' + money(amt, sym) + "</td>";
            body.appendChild(tr);
        });

        // totals
        const discPct = parseFloat($("meta-discount").value) || 0;
        const taxPct = parseFloat($("meta-tax").value) || 0;
        const discount = subtotal * (discPct / 100);
        const taxed = (subtotal - discount) * (taxPct / 100);
        const total = subtotal - discount + taxed;

        setText("pv-subtotal", money(subtotal, sym));
        setText("pv-discount", "-" + money(discount, sym));
        setText("pv-tax", money(taxed, sym));
        setText("pv-total", money(total, sym));
        $("pv-discount-row").style.display = discPct ? "" : "none";
        $("pv-tax-row").style.display = taxPct ? "" : "none";

        // notes
        const notes = $("meta-notes").value;
        const nEl = $("pv-notes");
        nEl.textContent = notes;
        nEl.style.display = notes ? "" : "none";

        // design (pro)
        const accent = $("opt-accent").value;
        document.documentElement.style.setProperty("--accent", accent);
        $("paper").className = "paper template-" + $("opt-template").value;

        // watermark
        $("pv-watermark").style.display = state.pro ? "none" : "";
    }

    function setText(id, val) {
        const el = $(id);
        el.textContent = val || "";
        el.style.display = val ? "" : "none";
    }

    function fmtDate(v) {
        if (!v) return "";
        const d = new Date(v + "T00:00:00");
        if (isNaN(d)) return v;
        return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    /* ===================== PRO STATE ===================== */
    function applyProState() {
        $("pro-badge").classList.toggle("hidden", !state.pro);
        document.querySelector(".pro-panel").setAttribute("data-locked", state.pro ? "false" : "true");
        // lock/unlock pro controls
        document.querySelectorAll("[data-pro]").forEach((el) => {
            el.disabled = !state.pro;
        });
        render();
    }

    function unlockPro(silent) {
        state.pro = true;
        localStorage.setItem(LS.pro, "1");
        applyProState();
        closeModal();
        if (!silent) toast("🎉 Pro unlocked — branding removed!");
    }

    /* ===================== PROFILE SAVE/LOAD ===================== */
    function saveProfile() {
        const p = {
            name: $("from-name").value,
            email: $("from-email").value,
            address: $("from-address").value,
            logo: state.logo
        };
        localStorage.setItem(LS.profile, JSON.stringify(p));
        toast("💾 Business profile saved");
    }

    function loadProfile() {
        try {
            const p = JSON.parse(localStorage.getItem(LS.profile) || "null");
            if (!p) return;
            $("from-name").value = p.name || "";
            $("from-email").value = p.email || "";
            $("from-address").value = p.address || "";
            if (p.logo) {
                state.logo = p.logo;
                showLogo(p.logo);
            }
        } catch (e) { /* ignore */ }
    }

    function showLogo(dataUrl) {
        const prev = $("logo-preview");
        prev.src = dataUrl;
        prev.classList.remove("hidden");
        $("logo-placeholder").classList.add("hidden");
    }

    /* ===================== PDF / PRINT ===================== */
    function downloadPdf() {
        const el = $("paper");
        const name = ($("meta-number").value || "invoice").replace(/[^a-z0-9\-_]/gi, "_");
        if (typeof html2pdf === "undefined") {
            toast("PDF library still loading — try again in a moment");
            return;
        }
        html2pdf().set({
            margin: 0,
            filename: name + ".pdf",
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
            jsPDF: { unit: "pt", format: "a4", orientation: "portrait" }
        }).from(el).save();
    }

    /* ===================== MODAL / TOAST ===================== */
    function openModal() { $("pro-modal").classList.remove("hidden"); }
    function closeModal() { $("pro-modal").classList.add("hidden"); }

    let toastTimer;
    function toast(msg) {
        const t = $("toast");
        t.textContent = msg;
        t.classList.remove("hidden");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
    }

    /* ===================== WIRE-UP ===================== */
    function init() {
        // sensible defaults
        const today = new Date();
        const due = new Date(today.getTime() + 14 * 864e5);
        $("meta-date").value = today.toISOString().slice(0, 10);
        $("meta-due").value = due.toISOString().slice(0, 10);

        loadProfile();
        addItem("Design services", 10, 75);
        addItem("Consulting", 4, 120);

        // live re-render on any editor input
        ["from-name", "from-email", "from-address", "to-name", "to-email", "to-address",
            "meta-number", "meta-currency", "meta-date", "meta-due", "meta-tax", "meta-discount",
            "meta-notes", "opt-template", "opt-accent"].forEach((id) => {
                const el = $(id);
                el.addEventListener("input", render);
                el.addEventListener("change", render);
            });

        $("add-item").addEventListener("click", () => addItem());
        $("save-profile").addEventListener("click", saveProfile);
        $("download-btn").addEventListener("click", downloadPdf);
        $("print-btn").addEventListener("click", () => window.print());

        // logo upload
        $("logo-input").addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                state.logo = reader.result;
                showLogo(reader.result);
                render();
            };
            reader.readAsDataURL(file);
        });

        // pro modal
        $("open-pro").addEventListener("click", openModal);
        $("pro-close").addEventListener("click", closeModal);
        $("pro-modal").addEventListener("click", (e) => { if (e.target.id === "pro-modal") closeModal(); });
        $("pro-hint").addEventListener("click", openModal);

        $("buy-pro").addEventListener("click", () => {
            if (CONFIG.stripePaymentLink) {
                window.location.href = CONFIG.stripePaymentLink;
            } else {
                toast("Add a Stripe Payment Link in app.js (see README)");
            }
        });

        $("apply-license").addEventListener("click", () => {
            const code = $("license-input").value.trim();
            const msg = $("license-msg");
            if (code && code.toUpperCase() === CONFIG.unlockCode.toUpperCase()) {
                msg.textContent = "Success! Unlocking…";
                msg.className = "license-msg ok";
                setTimeout(() => unlockPro(false), 500);
            } else {
                msg.textContent = "That code didn't work. Check and try again.";
                msg.className = "license-msg err";
            }
        });

        // auto-unlock when returning from a successful Stripe checkout
        if (new URLSearchParams(location.search).get("unlocked") === "1") {
            unlockPro(true);
            toast("🎉 Payment received — Pro unlocked!");
        }

        applyProState();
        render();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
