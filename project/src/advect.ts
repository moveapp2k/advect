import "./style.css";
import { $window, toModule } from "./utils";
import settings from "./settings";
import { PluginSystem } from "./plugins";
import advectCorePlugin from "./plugins/core.plugin";
import { AdvectElement } from "./AdvectElement";
import { AdvectView } from "./AdvectView";
import AdvectDebug from "./debug";
import { AdvectDisconnectEvent, AdvectMutationEvent } from "./events";

/**
 * Single dom parser not sure if this is more efficient
 */
const parser = new DOMParser();

/**
 * The main class for the Advect framework
 * contains the plugins and the global variables
 * and the start function
 */
export default class Advect {
  debug: typeof AdvectDebug = AdvectDebug;
  plugins = new PluginSystem();
  globals: Record<string, any> = [];
  loaded: string[] = [];
  async load(
    url: string,
    method: "GET" | "POST" | "PATCH" = "GET",
    headers: Record<string, string> = {
      "Content-Type": "text/html",
      accept: "text/html",
    }
  ) {
    const url_queue = [url];

    if (this.loaded.includes(url)) {
      url_queue.pop();
    }
    while (url_queue.length > 0) {
      const url = url_queue.pop() as string;
      const result = await fetch(url, { method, headers })
        .then(async (res) => {
          if (res.ok) {
            return {
              text: await res.text(),
              response: res,
              error: null,
            };
          }
        })
        .catch((e) => ({ error: e, text: null }));
      if (result?.error) {
        console.error(`Could not fetch template from ${url}`, result.error);
        continue;
      }
      if (!result?.text) {
        console.warn(`Loaded ${url} but no template found`);
        continue;
      }
      this.loaded.push(url);

      const doc = parser.parseFromString(result?.text, "text/html");
      const src_scripts = doc.querySelectorAll(
        `script[type='${settings.script_tag_type}']`
      );
      
      src_scripts.forEach((script) => {
        const src = script.getAttribute("src");
        if (src && !this.loaded.includes(src)) {
          url_queue.push(src);
        }
      });
      [...doc.querySelectorAll("template[id]")].forEach((_template: Node) => {
        const template = _template as HTMLTemplateElement;
        // TODO maybe make upgrading components a thing
        const existingCustomElement = customElements.get(template.id);
        if (existingCustomElement) {
          console.warn(`Template with id ${template.id} already exists`);
          return;
        }
        if (template.tagName.toLocaleLowerCase() != "template") {
          console.error("Template tag must be a template tag");
          return;
        }
        //   console.log("Adding template", template.id);
        this.build(template);
      });
    }
  }
  async build(_template: HTMLTemplateElement | string, register = true) {
    let template: HTMLTemplateElement | null = null;
    let doc: Document;
    if (typeof _template == "string") {
      doc = parser.parseFromString(_template, "text/html");
      template = doc.querySelector("template") as HTMLTemplateElement;
    } else {
      template = _template;
      doc = parser.parseFromString(template.outerHTML, "text/html");
    }

    doc = this.plugins.template_loaded(doc);

    // shadow mode can be open or closed we prefer open
    const shadow_mode =
      template.getAttribute("shadow-mode") ?? settings.default_shadow_mode;
    // use internals can be true or false
    //const use_internals = template.getAttribute('use-internals') == "true" || settings.default_use_internals;
    // get all the attributes except core to add to observedAttributes
    const attrs = [...template.attributes].filter(
      (attr) =>
        attr.name != "adv" && // no need to copy the adv attribute
        attr.name != "id" //switching ids is a bad idea
    );
    // get the main module expects a default export of a class that extends window.AdvectElement
    let mainModule = null;
    // only take 1 script and treat it as a module
    const mainScript = template.content.querySelector('script[type="module"]');
    if (mainScript && mainScript.textContent) {
      template.content.removeChild(mainScript);
      mainModule = await toModule(mainScript.textContent);
    }
    // Other scripts to add to the context
    // e
    const $scope_scripts = [
      ...(doc
        .querySelector("template")
        ?.content.querySelectorAll("script:not([type]):not([ignore])") ?? []),
    ].map((script) => {
      return { id: script.id, script: script.textContent as string };
    });

    const refs_ids = [...template.content.querySelectorAll("[id]")].map(
      (el) => el.id
    );
    // NOT USED BUT COULD BE
    const slots_names = [...template.content.querySelectorAll("slot")].map(
      (el) => el.name
    );

    const TemplateClass = class extends (mainModule?.default ??
      class extends AdvectElement {}) {
      $doc: Document = doc;
      $ref_ids: string[] = refs_ids;
      $slots_names: string[] = slots_names;
      $template: HTMLTemplateElement = template as HTMLTemplateElement;
      static $shadow_mode = shadow_mode;
      $scopes_scripts = $scope_scripts;
      static observedAttributes = attrs.map((attr) =>
        attr.name.toLocaleLowerCase()
      );
    };
    const PostPlugin = this.plugins.template_built(TemplateClass) || TemplateClass;
    if (register) {
      // @ts-ignore valid custom element name
      customElements.define(template.id, PostPlugin);
    }
    return TemplateClass;
  }

  start() {
    adv.plugins.addPlugin(advectCorePlugin);
    settings.plugins.forEach((plugin) => adv.plugins.addPlugin(plugin));
    // register all templates with adv attribute
    document
      .querySelectorAll(`template[id][${settings.load_tag_type}]`)
      .forEach((template) => {
        this.build(template as HTMLTemplateElement);
      });
    document
      .querySelectorAll(`script[type="${settings.script_tag_type}"][src]`)
      .forEach((script) => {
        const src = script.getAttribute("src");
        if (src) {
          this.load(src);
        }
      });
  }
}

const adv = ($window.advect = new Advect());
$window.AdvectElement = AdvectElement;
$window.AdvectMutationEvent = AdvectMutationEvent;
$window.AdvectDisconnectEvent = AdvectDisconnectEvent;
adv.start();

customElements.define("adv-view", AdvectView);
