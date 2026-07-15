/**
 * dom_stub.js
 *
 * Bac à sable DOM minimal, suffisant pour exécuter le script inline de
 * index.html sous Node et tester son comportement (pas de rendu visuel,
 * juste assez d'API pour que le code ne plante pas et que les assertions
 * puissent inspecter l'état des éléments).
 *
 * Volontairement PAS jsdom : réseau indisponible pour l'installer dans cet
 * environnement, et le projet évite déjà les dépendances externes quand ce
 * n'est pas nécessaire (voir le solveur SAT écrit à la main). Si vous avez
 * besoin d'une couverture DOM plus complète un jour (styles calculés,
 * événements qui bouillonnent, etc.), `npm install --save-dev jsdom` reste
 * la voie naturelle : ce stub peut être remplacé par un contexte jsdom sans
 * changer les tests qui l'utilisent (même API `document`/`window` de base).
 *
 * Portée couverte : getElementById/createElement/createTextNode,
 * appendChild, addEventListener, classList (add/remove/toggle/contains),
 * className, innerHTML, textContent, dataset, setAttribute, disabled,
 * hidden, value, focus/blur (+ document.activeElement), querySelectorAll("button").
 * Pas de rendu réel, pas de mise en page, pas de `style` calculé.
 */

function creerElementStub(tag, doc) {
    const el = {
        tagName: tag,
        _doc: doc,
        _children: [],
        _listeners: {},
        _classes: new Set(),
        dataset: {},
        attrs: {},
        style: {},
        disabled: false,
        hidden: false,
        value: "",
        href: "", target: "", rel: "", title: "", type: "",

        get innerHTML() { return this._html || ""; },
        set innerHTML(v) { this._html = v; this._children = []; },

        get textContent() {
            if (this._text !== undefined) return this._text;
            // Concatène le texte des enfants (suffisant pour les usages du projet :
            // un chip = un lien + un createTextNode, jamais imbriqué plus profond).
            return this._children.map(c => c.textContent !== undefined ? c.textContent : (c.text || "")).join("");
        },
        set textContent(v) { this._text = v; this._children = []; },

        appendChild(child) { this._children.push(child); return child; },

        addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
        dispatch(type, evt) {
            (this._listeners[type] || []).forEach(fn => fn(evt || { preventDefault() {} }));
        },

        setAttribute(k, v) { this.attrs[k] = v; },
        getAttribute(k) { return this.attrs[k]; },

        get classList() {
            const self = this;
            return {
                add: (c) => self._classes.add(c),
                remove: (c) => self._classes.delete(c),
                toggle: (c, force) => {
                    if (force === undefined) { self._classes.has(c) ? self._classes.delete(c) : self._classes.add(c); }
                    else { force ? self._classes.add(c) : self._classes.delete(c); }
                },
                contains: (c) => self._classes.has(c),
            };
        },
        set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
        get className() { return Array.from(this._classes).join(" "); },

        querySelectorAll(selecteur) {
            // Ne gère que ce dont le projet a besoin : "button" (groupes de boutons de filtre).
            if (selecteur === "button") return this._children.filter(c => c.tagName === "button");
            return [];
        },

        focus() { this._doc.activeElement = this; },
        blur() { if (this._doc.activeElement === this) this._doc.activeElement = null; },
    };
    return el;
}

/**
 * Crée un contexte { document, window, localStorage, navigator, URL, Blob }
 * prêt à injecter dans un `vm.createContext()` pour exécuter un script qui
 * s'attend à tourner dans un navigateur.
 */
function creerDomStub() {
    const elementsById = {};
    const document = {
        activeElement: null,
        getElementById(id) {
            if (!elementsById[id]) elementsById[id] = creerElementStub("div", document);
            return elementsById[id];
        },
        createElement(tag) { return creerElementStub(tag, document); },
        createTextNode(t) { return { nodeType: 3, text: t, textContent: t }; },
        addEventListener() {}, // ex. DOMContentLoaded : ignoré, les tests pilotent l'init eux-mêmes
        body: null,
    };
    document.body = creerElementStub("body", document);

    let stockage = {};
    const localStorage = {
        getItem: (k) => (k in stockage ? stockage[k] : null),
        setItem: (k, v) => { stockage[k] = v; },
        removeItem: (k) => { delete stockage[k]; },
        _reinitialiser: () => { stockage = {}; }, // utilitaire de test, pas une API DOM standard
    };

    const navigator = { clipboard: { writeText: async () => {} } };
    const URLStub = { createObjectURL: () => "blob:stub", revokeObjectURL: () => {} };
    const Blob = function () {};

    return { document, window: {}, localStorage, navigator, URL: URLStub, Blob, elementsById };
}

module.exports = { creerDomStub, creerElementStub };
