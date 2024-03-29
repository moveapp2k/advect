
// @ts-ignore

import mustache from "mustache";
// @ts-ignore
import { createStore } from "zustand/vanilla"

import $ from "cash-dom"

const $window = (window as Window & any);


const DBug = $window.dConsole = {
  enabled: true,
  mutations: [] as MutationRecord[],
  log(...args: any[]) {
    if (this.enabled) {
      console.log(...args);
    }
  },
  table(...args: any[]) {
    if (this.enabled) {
      console.table(...args);
    }
  },
  dir(...args: any[]) {
    if (this.enabled) {
      console.dir(...args);
    }
  }
}

// A spot for holding all the templates
if (!$window.$adv_templates) {
  requestAnimationFrame(() => {
    document.body.innerHTML += `<div id="$adv_templates" style="display:none;"></div>`;
  });
}

/**
 * Used to type the base class of a custom web component class
 */
type Constructor<T> = {
  new(...args: any[]): T;
}

type $BaseClass = Constructor<HTMLElement>;

export interface DDataType<T> {
  name: string;
  parse: (val: string) => { valid: boolean, parsed: T };
  store: (val: T) => string;
}

export interface DBinding {
  name: string;
  handle(provider: HTMLElement, attr: Attr, receiver: HTMLElement): () => Promise<void>;

}

export interface DAction {

}


interface DDataNode<T = {}> {
  id: string;
  name: string;
  initialValue: string;
  dataType: DDataType<T>
  dataAttrName: string;
  attr?: DAttr;
  owner: HTMLElement;
  dataElement: HTMLDataElement;
}

interface IDAttr<T = {}> {
  value: T;
  node: DDataNode<T>;
}

type DAttr = Attr & IDAttr;


type DDataProxy = {
  [key: string]: DAttr;
}


const textBinding: DBinding = {
  name: "text",
  handle(_: HTMLElement, attr: Attr, receiver: HTMLElement) {
    return async () => {
      console.log('text binding', {attr, receiver})
      receiver.innerHTML = attr.value;
    };
  }
}


const stringDataType: DDataType<string> = {
  name: "string",
  parse: (val: string) => {
    return { valid: true, parsed: val };
  },
  store: (val: string) => val,
};

const numberDataType: DDataType<number> = {
  name: "number",
  parse: (val: string) => {
    const parsed = parseFloat(val);
    return { valid: !isNaN(parsed), parsed };
  },
  store: (val: number) => val.toString(),
};

const booleanDataType: DDataType<boolean> = {
  name: "boolean",
  parse: (val: string) => {
    return { valid: val === "true" || val === "false", parsed: val === "true" };
  },
  store: (val: boolean) => val.toString(),
};


interface IDDS {
  template_attr: string;
  frame: number;
  frames: ((frame: number, framesRemaining: number) => void)[];
  framesRemaining: number;
  initiated: boolean;
  ids: Map<string, DDataProxy>;
  mutObservers: Map<string, MutationObserver>;
  addMutObserver: (root: HTMLElement) => void;
  script_type: string;
  ignored_attrs: string[];
  proccessed_events: string[];
  bindingHandles: Map<string, DBinding>;
  nodes: Map<string, DDataNode>;
  bind: (name: string, binding: DBinding) => void;
  start: () => void;
  types: Map<string, DDataType<any | any>>;
  type: <T>(name: string, dt: DDataType<T>) => void;
  loaded: Map<string, boolean>;
  load: (url: string) => Promise<void>;
  attrs: Map<string, Attr>;
  /**
   * 
   * @param el 
   * @param scan check for new data elements
   * @returns 
   */
  data: (el: HTMLElement, scan?: boolean) => any;
  /**
   * "Compiles" a template into a custom element using
   * @param template the template Element to compile must have [adv] attribute
   * @param baseClass a base class to extend from
   * @returns a custom element class
   */
  compile: (template: HTMLTemplateElement, baseClass: $BaseClass | null) => void;
}
const DDSStore = createStore<IDDS>((set, get) => {
  return {
    template_attr: "adv",
    frame: 0,
    frames: [],
    framesRemaining: 0,
    ids: new Map(),
    initiated: false,
    mutObservers: new Map(),
    addMutObserver(root) {
      const newObserver = new MutationObserver((mutationList) => {
        const state = get();
        if (DBug.enabled) {
          DBug.mutations.push(...mutationList);
        }
        for (const mutation of mutationList) {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1) {
                if (node.nodeName === "DATA") {
                  state.data(node.parentElement as HTMLElement, true);
                  return;
                }
                state.data(node as HTMLElement, true);
              }
            });
            mutation.removedNodes.forEach((node) => {
              // Check for removed <Data/> elments, or maby not there not use after they load any way
              if (node.nodeType === 1) {
                const id = (node as HTMLElement).id;
                if (state.ids.has(id)) {
                  state.ids.delete(id);
                }
                state.attrs = new Map(
                  [...state.attrs].filter(([key]) => key.split("-")[0] !== id)
                );
              }
            });
            // console.log('set before mutation') 
            set({ ids: new Map(state.ids), attrs: new Map(state.attrs) })
          }
        }
      });
      const state = get();
      if (root.shadowRoot) {
        newObserver.observe(root.shadowRoot, { childList: true, subtree: true, attributes: true });
      }
      newObserver.observe(root, { childList: true, subtree: true, attributes: true });

      set({ mutObservers: new Map([...state.mutObservers, [root.id, newObserver]]) });
    },
    proccessed_events: Object.keys(HTMLElement.prototype).filter((name) => name.startsWith("on")),
    script_type: "text/adv",
    ignored_attrs: ["id", "adv", "data-shadow", "data-internal"],

    start() {
      const state = get();
      if (!state.initiated) {
        state.addMutObserver(document.body);

        set({ initiated: true });
        // setInterval(() => {
        //   const frameFunc = state.frames.shift();
        //   if (frameFunc) {
        //     requestAnimationFrame(() => {
        //       frameFunc(++state.frame, state.frames.length);
        //       set({ initiated: true, frames: state.frames, frame: state.frame, framesRemaining: state.frames.length });
        //     });
        //   }
        // }, 100);

        // kick off the first frame
        document.addEventListener("DOMContentLoaded", () => {
          const state = get();
          const scriptTemplates = [
            ...document.querySelectorAll(`script[type="${state.script_type}"]`),
          ];

          document.querySelectorAll("[id]").forEach((el) => {
            if (el.nodeType !== 1) {
              state.data(el as HTMLElement);
            }
          });

          scriptTemplates.forEach((script) => {
            const src = script.getAttribute("src");
            if (src) {
              state.load(src);
            }
          });
        });
      }
    },

    bindingHandles: new Map<string, DBinding>([
      ["text", textBinding],
    ]),
    bind(name: string, binding: DBinding) {
      const state = get();
      state.bindingHandles.set(name, binding);
      console.log('set before binding')
      set({ bindingHandles: new Map(state.bindingHandles) });
    },
    types: new Map([
      ["string", stringDataType],
      ["number", numberDataType],
      ["boolean", booleanDataType],
    ] as any),
    type(name: string, dt: DDataType<any>) {
      const state = get();
      state.types.set(name, dt);
      console.log('set before type')
      set({ types: new Map(state.types) });
    },
    loaded: new Map(),
    async load(url: string) {
      const state = get();
      if (state.loaded.has(url)) {
        return;
      }
      return fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "text/html",
          accept: "text/html",
        },
      })
        .then((res) => res.text())
        .then((text) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, "text/html");
          const src_scripts = doc.querySelectorAll(`script[type='${state.script_type}']`);
          src_scripts.forEach((script) => {
            const src = script.getAttribute("src");
            if (src) {
              state.load(src);
              state.loaded.set(src, true);
            }
          });

          [...doc.querySelectorAll("template[id][adv]")].forEach((template) => {
            // TODO maybe make upgrading components a thing
            const existingCustomElement = customElements.get(template.id);
            if (existingCustomElement) {
              console.warn(`Template with id ${template.id} already exists`);
              return;
            }

            document.getElementById('#$adv_templates')?.appendChild(template);
            state.compile(
              template as HTMLTemplateElement,
              $window[template.getAttribute(state.template_attr) || "HTMLElement"]
            );
          });
          console.log('set before load')
          set({ loaded: new Map(state.loaded) });

        })
        .catch((e) => {
          console.error(`Could not parse template from request`, e);
        });
    },
    attrs: new Map(),
    nodes: new Map(),
    data(el: HTMLElement, scan: boolean = false) {
      const state = get()

      if (el.id == null || el.id == '') {
        return;
      }

      if (state.ids.has(el.id) && !scan) {
        return state.ids.get(el.id);
      }

      const dNodes = new Map<string, DDataNode>();
      const dAttrs = new Map<string, DAttr>();

      const datas = [...(el.shadowRoot?.querySelectorAll('data') ?? []), ...el.querySelectorAll('data')];
      datas.forEach((dEl: HTMLDataElement) => {
        if (state.nodes.has(`${el.id}-${dEl.getAttribute('name')}`)) {
          return;
        }
        const name = dEl.getAttribute('name') ?? '';
        const type = dEl.getAttribute('type') ?? '';
        const initialValue = dEl.getAttribute('value') ?? '';

        if (name == '') {
          throw new Error('Data element must have a name attribute');
        }
        const dataType = state.types.get(type) ?? state.types.get('string') as DDataType<any>;
        const dataAttrName = `data-${name}`;
        const id = `${el.id}-${name}`;
        ;
        dNodes.set(`${el.id}-${name}`, {
          id,
          name,
          initialValue,
          dataType,
          dataAttrName,
          owner: el,
          dataElement: dEl
        });
      });
      dNodes.forEach((node) => {
        const isNewAttr = !el.hasAttribute(node.dataAttrName);
        const attr = isNewAttr ? document.createAttribute(node.dataAttrName) : el.getAttributeNode(node.dataAttrName) as Attr;
        const attrProxyAttr = new Proxy(attr, {
          get: (target, prop) => {
            if (prop == 'value') {
              const { parsed, valid } = node.dataType.parse(target.value ?? node.initialValue);
              if (!valid) {
                console.warn(`Invalid value for ${node.name} on ${node.owner.id} - property ${parsed} - ${target.value} type ${node.dataType.name}`);
              }
              return parsed;
            }
            if (prop == 'node') {
              return node;
            }
            Reflect.get(target, prop);
          },
          set: (target, prop, value) => {
            if (prop == 'value') {
              target.value = node.dataType.store(value);
              return true;
            }
            return false;
          }
        }) as DAttr;
        node.attr = attrProxyAttr;

        dAttrs.set(node.id, attrProxyAttr);
        attr.value = node.initialValue;
        if (isNewAttr) {
          node.owner.setAttributeNode(attr);

        }
      });

      if (scan) {
        console.log('set before scan')
        set({ ids: new Map(state.ids), attrs: new Map([...state.attrs, ...dAttrs]), nodes: new Map([...state.nodes, ...dNodes]) });
        return state.ids.get(el.id)
      }

      const dataProxy: DDataProxy = new Proxy({
      }, {
        ownKeys: () => {
          const state = get();
          const keys = [...state.nodes.values()].filter((n) => n.owner.id === el.id).map((n) => n.name);
          return keys
        },
        get: (target, prop) => {
          const state = get();
          if (typeof prop == 'string' && state.attrs.has(`${el.id}-${prop}`)) {
            return state.attrs.get(`${el.id}-${prop}`);
          }

          if (prop == 'id') {
            return el.id;
          }
          return Reflect.get(target, prop);
        },
      });
      console.log('set before new data proxy')

      state.ids.set(el.id, dataProxy);
      set({ ids: new Map(state.ids), attrs: new Map([...state.attrs, ...dAttrs]), nodes: new Map([...state.nodes, ...dNodes]) });

      //  const attr_name = mutation.attributeName ?? '';
      // will have data if attribute has been D-ed

      return dataProxy;
    },
    compile($template: HTMLTemplateElement, $baseClass: $BaseClass | null) {
      // Define the custom Element
      const _class = class extends ($baseClass ?? HTMLElement) {
        static #ic = -1;
        static get observedAttributes() {
          return $template
            .getAttributeNames()
            .filter((n) => get().ignored_attrs.indexOf(n.toLowerCase()) === -1);
        }

        refs: Record<string, Node> = {};
        // @ts-ignore
        #originalContent!: HTMLElement;

        get signature() {
          return `${$template.id}-${this.dataset["instance"]}`;
        }

        get attrs() {
          return get().data(this);
        }
        attrChanged: (name: string, oldValue: string, newValue: string) =>
          void = (_name: string, _oldValue: string, _newValue: string) => { };

        attributeChangedCallback(name: string, oldValue: string, newValue: string) {
          this?.attrChanged(name, oldValue, newValue);
        }

        get root(): ShadowRoot | HTMLElement {
          return this.shadowRoot ?? this;
        }

        constructor() {
          super();
          this.$class.#ic++;


        }
        get $class() {
          return (this.constructor as typeof _class);
        }
        get ic() {
          return this.$class.#ic;
        }

        connectedCallback() {
          this.id = `${$template.id}-${this.ic}`;

          const state = get();
          this.#originalContent = this.cloneNode(true) as HTMLElement;

          if ($template.dataset.shadow && $template.dataset.shadow === "open") {
            this.attachShadow({ mode: "open" });
            if (this.shadowRoot) {
              this.shadowRoot.innerHTML = $template.innerHTML;
            }
          } else {
            this.innerHTML = $template.innerHTML;
          }

          if ($template.dataset.internals && $template.dataset.internals === "true") {
            this.attachInternals();
          }
          this.dataset["instance"] = this.ic.toString();



          this.#buildRefs();
          this.#evalScripts();
          this.#evalStyles();

          requestAnimationFrame(() => {
            state.addMutObserver(this);
          });
          //  this.$$d()

        }
        disconnectedCallback() {
          // console.log("disconnected");
          this?.diconnected();
        }
        diconnected = () => { };

        #buildRefs() {
          // these guys are special
          const els = [
            ...this.root.querySelectorAll(
              "[id]"
            ),
          ];
          els.forEach((el) => {
            // change the id so that it is unique across all instances
            const og_id = el.id;
            requestAnimationFrame(() => {
              el.id = `${this.signature}-${el.id}`;
              // DDS.$d(el as HTMLElement);
            });

            // Weakref these maybe
            // set global refsf
            //   $adv.refs.set(el.id,el);
            // set local refs
            this.refs[og_id] = el;
          });
        }
        async #evalScripts() {
          // need at one list to hook up the events
          const html = String.raw;
          const scripts = [...this.root.querySelectorAll("script")];
          const $self = this;
          // all scripts out put are merged into one scope
          let $scope = {};

          for (let s of scripts) {
            try {
              await async function () {
                const _$scope = await eval(
                  "(async function(){" + s.textContent + "})()"
                );
                if (_$scope && _$scope.constructor.name === "AsyncFunction") {
                  const __$scope = await _$scope();
                  $scope = { ...$scope, ...__$scope };
                }
                if (
                  _$scope instanceof Function &&
                  !(_$scope instanceof Promise)
                ) {
                  const __$scope = _$scope();
                  $scope = { ...$scope, ...__$scope };
                }
                if (_$scope) {
                  $scope = { ...$scope, ..._$scope };
                }
              }.call({ $self, $template, $scope, html });
            } catch (e) {
              console.error(e);
            }
          }
          Object.values(this.refs).forEach(($$ref) => {
            const $ref = $$ref as HTMLElement;
            const event_attrs = $ref
              .getAttributeNames()
              .filter((name) => name.startsWith("on"));

            event_attrs.forEach((name) => {
              const attr_val = $ref.getAttribute(name) ?? "";
              // @ts-expect-error assigning event handlers by name nothing to see here
              $ref[name] = ($event: Event) => {
                (() => {
                  eval("(async function(){" + attr_val + "})()").catch((e: Error) => {
                    console.error({
                      e,
                      s: attr_val,
                    });
                  });
                }).call({
                  $ref,
                  $self,
                  $event,
                  html,
                  $template,
                  ...$scope,
                });
              };
            });
            $ref.dispatchEvent(new Event("load", { bubbles: true }));
          });
        }

        #evalStyles() {
          //const styles = [...this.querySelectorAll("style")];
        }



      }
      customElements.define($template.id, _class);
    }


  }
})


export const DDS = $window.DDS = DDSStore;

DDS.getState().start();
DDS.subscribe((state, prevState) => {
  
    console.log('main subscription')
  for (const [id, el] of state.nodes) {
    const shadow = el.owner.shadowRoot;
    const all_bindings = [...state.bindingHandles.keys()].map((name) => `[\\:${name}]`).join(",");
    const bindEls: Element[] = [];
    if (shadow) {
      bindEls.push(...shadow.querySelectorAll(all_bindings));
    }
    bindEls.push(...el.owner.querySelectorAll(all_bindings));
    for (const bindEl of bindEls) {
      const bindings = bindEl.getAttributeNames().filter((name) => name.startsWith(":"));
      for (const binding of bindings) {
        const bindType = binding.slice(1);
        const bindName = bindEl.getAttribute(binding) ?? '';
        const handle = state.bindingHandles.get(bindType);
        const provider = ((bindEl as HTMLElement).closest(`[data-${bindName}]`) ?? 
        ((bindEl.getRootNode() as HTMLElement).querySelector(`[data-${bindName}]`)) ??
        document.querySelector(`[data-${bindName}]`)) as HTMLElement | null;
        if (handle && provider) {
          requestAnimationFrame(() => {
            console.log({attrs: state.attrs, nodes: state.nodes})
            const attr = state.attrs.get(`${provider.id}-${bindName}`);
            console.log({attr,provider,el});
            if (!attr) {
              console.warn(`No attribute for ${el.name} on ${provider.id}`);
              return;
            }
            handle.handle(provider, attr, bindEl as HTMLElement)();
          });
        }
        else {
          console.warn(`No binding handle for ${bindType}`,{name: bindType, handle,provider,bindEl});  
        }
      }
    }
  }


});


