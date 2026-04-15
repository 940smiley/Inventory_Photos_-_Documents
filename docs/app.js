const manifestUrl = "./inventory-manifest.json";
const storageKey = "inventory-listing-console-edits";

const categoryRules = [
  { category: "Stamps & Postal", ebayCategory: "Stamps", tags: ["stamplicity", "postal", "philately"], patterns: ["stamp", "postal", "postcard", "post-card", "cover", "philatel", "usps", "post due", "letters-covers", "cancellation"] },
  { category: "Trading Cards", ebayCategory: "Sports Mem, Cards & Fan Shop", tags: ["cards", "collectible"], patterns: ["cards", "baseball", "basketball", "football", "soccer", "ufc", "tcg", "ccg", "pokemon", "yugi", "panini", "fleer", "donruss", "topps"] },
  { category: "Books, Comics & Posters", ebayCategory: "Books & Magazines", tags: ["media", "paper"], patterns: ["books", "comics", "posters", "magazines", "newspaper", "hardbacks", "erb-first"] },
  { category: "Coins, Currency & Checks", ebayCategory: "Coins & Paper Money", tags: ["money"], patterns: ["monies", "coins", "currency", "checks", "dollar"] },
  { category: "Art & Prints", ebayCategory: "Art", tags: ["visual", "decor"], patterns: ["art", "print-on-demand", "portraits", "autographed"] },
  { category: "Home, China & Silver", ebayCategory: "Pottery & Glass", tags: ["home", "tabletop"], patterns: ["china", "porcelain", "porceline", "plate", "teacups", "silverware", "sterling", "plated", "vase", "pottery"] },
  { category: "Clothing & Accessories", ebayCategory: "Clothing, Shoes & Accessories", tags: ["wearable"], patterns: ["fashion", "belts", "buckles", "watches"] },
  { category: "Media & Electronics", ebayCategory: "Consumer Electronics", tags: ["media", "electronics"], patterns: ["dvd", "vhs", "game-consoles", "game-media", "atari", "xbox", "pc"] },
  { category: "Toys & Games", ebayCategory: "Toys & Hobbies", tags: ["toys"], patterns: ["toys", "pogs"] },
  { category: "Music & Instruments", ebayCategory: "Musical Instruments & Gear", tags: ["instrument"], patterns: ["instruments"] },
  { category: "Vehicles & Parts", ebayCategory: "eBay Motors", tags: ["vehicle"], patterns: ["chevrolet", "beretta", "bikes", "bike"] },
  { category: "Ephemera & Documents", ebayCategory: "Collectibles", tags: ["paper", "documents"], patterns: ["ephemera", "documents", "letters", "greetingcard"] },
  { category: "Collectibles", ebayCategory: "Collectibles", tags: ["general"], patterns: ["collectibles", "coke", "clox", "military", "sports"] }
];

const state = { manifest: null, items: [], visible: [], edits: loadEdits() };

const els = {
  totalItems: document.querySelector("#totalItems"),
  listingReady: document.querySelector("#listingReady"),
  stampCount: document.querySelector("#stampCount"),
  visibleCount: document.querySelector("#visibleCount"),
  manifestMeta: document.querySelector("#manifestMeta"),
  grid: document.querySelector("#inventoryGrid"),
  template: document.querySelector("#itemTemplate"),
  search: document.querySelector("#searchInput"),
  category: document.querySelector("#categoryFilter"),
  stampOnly: document.querySelector("#stampOnlyToggle"),
  endpoint: document.querySelector("#endpointInput"),
  directory: document.querySelector("#directoryInput"),
  rescan: document.querySelector("#rescanButton"),
  exportCsv: document.querySelector("#exportCsvButton"),
  exportJson: document.querySelector("#exportJsonButton"),
  previewDialog: document.querySelector("#previewDialog"),
  previewImage: document.querySelector("#previewImage"),
  previewCaption: document.querySelector("#previewCaption"),
  closePreview: document.querySelector("#closePreview")
};

function loadEdits() {
  try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
}

function saveEdits() {
  localStorage.setItem(storageKey, JSON.stringify(state.edits));
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[_-]+/g, " ");
}

function classify(item) {
  const haystack = normalize(`${item.path} ${item.folder} ${item.name}`);
  const match = categoryRules.find((rule) => rule.patterns.some((pattern) => haystack.includes(pattern)));
  const rule = match || { category: "Needs Review", ebayCategory: "Collectibles", tags: ["review"], patterns: [] };
  const confidence = match ? Math.min(98, 58 + Math.max(...rule.patterns.map((p) => haystack.includes(p) ? p.length : 0))) : 38;
  const objectName = inferObjectName(item, rule.category);
  const title = buildTitle(objectName, rule.category, item.folderParts || []);
  return { category: rule.category, ebayCategory: rule.ebayCategory, tags: rule.tags, confidence, objectName, title, condition: "Used", quantity: 1, startPrice: "", notes: "" };
}

function inferObjectName(item, category) {
  const folders = (item.folderParts || []).filter(Boolean).map((part) => part.replace(/[_-]+/g, " ").trim());
  const bestFolder = folders[folders.length - 1] || folders[0] || "";
  const filename = item.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const genericPhotoName = /^(img|dsc|pxl|edit|20\d{2}|202\d|aq|ar|as|at|au|av|aw|aa|ab|ac|ad|ae)/i.test(filename);
  return titleCase(genericPhotoName && bestFolder ? bestFolder : filename || category);
}

function buildTitle(objectName, category, folderParts) {
  const folder = titleCase(folderParts.slice(-2).join(" ").replace(/[_-]+/g, " "));
  const basis = folder && !objectName.toLowerCase().includes(folder.toLowerCase()) ? `${folder} ${objectName}` : objectName;
  const suffix = category === "Stamps & Postal" ? "Stamp Postal Collectible" : category.replace("&", "and");
  return trimTitle(`${basis} ${suffix}`);
}

function titleCase(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase().replace(/\b[a-z0-9]/g, (char) => char.toUpperCase());
}

function trimTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function hydrateItem(item) {
  const analysis = classify(item);
  const edit = state.edits[item.id] || {};
  return { ...item, analysis: { ...analysis, ...edit }, stamplicity: analysis.category === "Stamps & Postal" };
}

async function loadManifest() {
  els.manifestMeta.textContent = "Loading manifest...";
  const response = await fetch(`${manifestUrl}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Manifest request failed: ${response.status}`);
  state.manifest = await response.json();
  state.items = state.manifest.items.map(hydrateItem);
  populateCategories();
  applyFilters();
  els.manifestMeta.textContent = `Generated ${new Date(state.manifest.generatedAt).toLocaleString()} from ${state.manifest.sourceRoot}`;
}

function populateCategories() {
  const categories = [...new Set(state.items.map((item) => item.analysis.category))].sort();
  els.category.innerHTML = '<option value="">All categories</option>';
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    els.category.append(option);
  }
}

function applyFilters() {
  const query = normalize(els.search.value);
  const category = els.category.value;
  const stampOnly = els.stampOnly.checked;
  state.visible = state.items.filter((item) => {
    const text = normalize(`${item.name} ${item.path} ${item.analysis.category} ${item.analysis.title} ${item.analysis.notes}`);
    return (!query || text.includes(query)) && (!category || item.analysis.category === category) && (!stampOnly || item.stamplicity);
  });
  render();
}

function render() {
  els.totalItems.textContent = state.items.length.toLocaleString();
  els.listingReady.textContent = state.items.filter((item) => item.analysis.title).length.toLocaleString();
  els.stampCount.textContent = state.items.filter((item) => item.stamplicity).length.toLocaleString();
  els.visibleCount.textContent = state.visible.length.toLocaleString();

  const fragment = document.createDocumentFragment();
  for (const item of state.visible.slice(0, 600)) fragment.append(renderItem(item));
  els.grid.replaceChildren(fragment);
  if (state.visible.length > 600) {
    const note = document.createElement("p");
    note.className = "hint";
    note.style.padding = "18px";
    note.textContent = `Showing first 600 of ${state.visible.length.toLocaleString()} matches. Narrow the search to work a smaller batch.`;
    els.grid.append(note);
  }
}

function renderItem(item) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const img = node.querySelector("img");
  const badge = node.querySelector(".mediaBadge");
  const title = node.querySelector("h3");
  const confidence = node.querySelector(".confidence");
  const path = node.querySelector(".path");
  const tags = node.querySelector(".tags");
  const titleInput = node.querySelector(".titleInput");
  const notesInput = node.querySelector(".notesInput");
  const analyze = node.querySelector(".analyzeButton");
  const copy = node.querySelector(".copyButton");
  const thumbButton = node.querySelector(".thumbButton");

  img.src = item.mediaType === "image" ? assetPath(item) : "";
  img.alt = item.analysis.title;
  badge.textContent = item.mediaType;
  title.textContent = item.analysis.objectName;
  confidence.textContent = `${item.analysis.confidence}%`;
  path.textContent = item.path;
  titleInput.value = item.analysis.title || "";
  notesInput.value = item.analysis.notes || "";

  const tagValues = [item.analysis.category, item.analysis.ebayCategory, ...item.analysis.tags];
  if (item.stamplicity) tagValues.push("Stamplicity");
  for (const value of tagValues) {
    const tag = document.createElement("span");
    tag.className = `tag${value === "Needs Review" ? " warn" : ""}`;
    tag.textContent = value;
    tags.append(tag);
  }

  titleInput.addEventListener("change", () => updateEdit(item.id, { title: trimTitle(titleInput.value) }));
  notesInput.addEventListener("change", () => updateEdit(item.id, { notes: notesInput.value.trim() }));
  analyze.addEventListener("click", () => analyzeItem(item, analyze));
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(toCsv([item], false));
    copy.textContent = "Copied";
    setTimeout(() => { copy.textContent = "Copy row"; }, 1200);
  });
  thumbButton.addEventListener("click", () => showPreview(item));
  return node;
}

function updateEdit(id, patch) {
  state.edits[id] = { ...(state.edits[id] || {}), ...patch };
  saveEdits();
  const index = state.items.findIndex((item) => item.id === id);
  if (index !== -1) state.items[index] = hydrateItem(state.items[index]);
}

async function analyzeItem(item, button) {
  const endpoint = els.endpoint.value.trim();
  if (!endpoint) {
    button.textContent = "Add endpoint";
    setTimeout(() => { button.textContent = "Analyze"; }, 1400);
    return;
  }

  button.disabled = true;
  button.textContent = "Analyzing";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagePath: item.path, source: "Inventory_Photos_-_Documents", expectedCategory: item.analysis.category, marketplace: ["ebay", "facebook", "mercari"], stamplicity: item.stamplicity })
    });
    if (!response.ok) throw new Error(`Endpoint returned ${response.status}`);
    const result = await response.json();
    updateEdit(item.id, {
      title: trimTitle(result.title || result.name || item.analysis.title),
      notes: result.description || result.notes || item.analysis.notes,
      confidence: result.confidence || item.analysis.confidence,
      objectName: result.objectName || result.type || item.analysis.objectName
    });
    applyFilters();
  } catch (error) {
    button.textContent = "Failed";
    console.error(error);
    setTimeout(() => { button.textContent = "Analyze"; }, 1600);
  } finally {
    button.disabled = false;
  }
}

function showPreview(item) {
  if (item.mediaType !== "image") return;
  els.previewImage.src = assetPath(item);
  els.previewImage.alt = item.analysis.title;
  els.previewCaption.textContent = `${item.analysis.title} - ${item.path}`;
  els.previewDialog.showModal();
}

function assetPath(item) {
  const inDocsFolder = location.pathname.endsWith("/docs/") || location.pathname.includes("/docs/");
  return inDocsFolder ? `../${item.path}` : item.path;
}

function rowsForExport() {
  return state.visible.map((item) => ({
    id: item.id,
    path: item.path,
    folder: item.folder,
    title: item.analysis.title,
    category: item.analysis.category,
    ebayCategory: item.analysis.ebayCategory,
    condition: item.analysis.condition,
    quantity: item.analysis.quantity,
    startPrice: item.analysis.startPrice,
    notes: item.analysis.notes,
    stamplicity: item.stamplicity
  }));
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(items, includeHeader = true) {
  const rows = items.map((item) => {
    const row = {
      Title: item.analysis?.title || item.title,
      Description: item.analysis?.notes || item.notes || "Inventory photo pending final description.",
      "Primary Category": item.analysis?.ebayCategory || item.ebayCategory,
      "Store Category": item.analysis?.category || item.category,
      Condition: item.analysis?.condition || item.condition || "Used",
      Quantity: item.analysis?.quantity || item.quantity || 1,
      "Start Price": item.analysis?.startPrice || item.startPrice || "",
      "Image URL": item.path,
      "Custom Label": item.id,
      "Shipping Service": "USPS Ground Advantage",
      "Return Accepted": "Yes",
      "Listing Source": "Inventory_Photos_-_Documents"
    };
    return Object.values(row).map(csvEscape).join(",");
  });
  if (!includeHeader) return rows.join("\n");
  const header = ["Title", "Description", "Primary Category", "Store Category", "Condition", "Quantity", "Start Price", "Image URL", "Custom Label", "Shipping Service", "Return Accepted", "Listing Source"].map(csvEscape).join(",");
  return [header, ...rows].join("\n");
}

function download(filename, body, type) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleDirectory(files) {
  const mapped = Array.from(files)
    .filter((file) => /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|mp4|mov|m4v)$/i.test(file.name))
    .map((file) => {
      const path = file.webkitRelativePath || file.name;
      const parts = path.split("/");
      return {
        id: `local-${crypto.randomUUID()}`,
        name: file.name,
        path,
        folder: parts.slice(0, -1).join("/"),
        folderParts: parts.slice(0, -1),
        extension: file.name.includes(".") ? `.${file.name.split(".").pop().toLowerCase()}` : "",
        mediaType: /\.(mp4|mov|m4v)$/i.test(file.name) ? "video" : "image",
        sizeBytes: file.size,
        modifiedUtc: new Date(file.lastModified).toISOString()
      };
    });
  state.manifest = { generatedAt: new Date().toISOString(), sourceRoot: "local-folder", totalItems: mapped.length, items: mapped };
  state.items = mapped.map(hydrateItem);
  populateCategories();
  applyFilters();
  els.manifestMeta.textContent = `Local scan loaded ${mapped.length.toLocaleString()} media files.`;
}

els.search.addEventListener("input", applyFilters);
els.category.addEventListener("change", applyFilters);
els.stampOnly.addEventListener("change", applyFilters);
els.rescan.addEventListener("click", loadManifest);
els.exportCsv.addEventListener("click", () => download("ebay-inventory-listings.csv", toCsv(state.visible), "text/csv"));
els.exportJson.addEventListener("click", () => download("inventory-listings.json", JSON.stringify(rowsForExport(), null, 2), "application/json"));
els.directory.addEventListener("change", (event) => handleDirectory(event.target.files));
els.closePreview.addEventListener("click", () => els.previewDialog.close());

loadManifest().catch((error) => {
  els.manifestMeta.textContent = "Manifest not found. Run scripts/generate-inventory-manifest.ps1, then reload.";
  console.error(error);
});
