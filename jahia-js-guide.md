# Jahia JavaScript Module Development Guide

This comprehensive guide documents proven implementation patterns, Jahia helpers, and best practices for developing JavaScript Modules in Jahia. Use this as a reference to avoid common pitfalls and implement features correctly the first time.

---

## Table of Contents

1. [Repository Layout](#1-repository-layout)
2. [Component Anatomy](#2-component-anatomy)
3. [Working with JCR Nodes](#3-working-with-jcr-nodes)
4. [CSS Resources & Styling](#4-css-resources--styling)
5. [Localization (i18n)](#5-localization-i18n)
6. [Content Editor Forms (JSON Overrides)](#6-content-editor-forms-json-overrides)
7. [Dynamic Fieldsets](#7-dynamic-fieldsets)
8. [Build & Deploy](#8-build--deploy)
9. [Troubleshooting Patterns](#9-troubleshooting-patterns)
10. [Best Practices](#10-best-practices)

---

## 1. Repository Layout

```
your-module/
├── package.json                    # Scripts, dependencies, Jahia metadata
├── tsconfig.json                   # TypeScript configuration
├── vite.config.mjs                 # Vite build configuration
├── src/
│   ├── components/                 # Component folders
│   │   ├── ComponentA/
│   │   │   ├── definition.cnd      # Node type & property definitions
│   │   │   ├── types.ts            # TypeScript interfaces
│   │   │   ├── default.server.tsx  # Default server view
│   │   │   ├── otherView.server.tsx # Additional views
│   │   │   ├── interactive.island.client.tsx # Client interactivity
│   │   │   └── ComponentA.module.css    # Component styles
│   │   ├── ComponentB/
│   │   └── ComponentC/
│   └── types.d.ts                  # Global type declarations
├── settings/
│   ├── definitions.cnd             # SHARED MIXINS ONLY (not component types)
│   ├── content-editor-forms/       # JSON overrides for Content Editor UI
│   │   ├── fieldsets/
│   │   │   └── yourmodulent_componentA.json
│   │   └── README.md
│   ├── locales/                    # Client-side i18n (i18next)
│   │   ├── en.json
│   │   └── fr.json
│   ├── resources/                  # Server-side resource bundles
│   │   ├── your-module_en.properties
│   │   └── your-module_fr.properties
│   └── content-types-icons/        # Optional: Custom icons
└── dist/                           # Build output (generated)
    ├── server/index.js             # Server bundle
    ├── client/                     # Client islands
    └── assets/style.css            # Compiled CSS

```

### Key Conventions

- **Each component has its own `definition.cnd`** inside its folder
- **`settings/definitions.cnd` contains ONLY shared mixins** across components
- **CSS Modules** are scoped per component (`.module.css`)
- **TypeScript everywhere** with strict typing enabled

---

## 2. Component Anatomy

### 2.1 Component Definition (`definition.cnd`)

Defines the content type structure using JCR Content and Node Type (CND) syntax.

**Example: `src/components/YourComponent/definition.cnd`**

```cnd
<jnt = 'http://www.jahia.org/jahia/nt/1.0'>
<jmix = 'http://www.jahia.org/jahia/mix/1.0'>
<yourmodulent = 'http://modules.yourcompany.org/yourmodule/nt/1.0'>
<yourmodulemix = 'http://modules.yourcompany.org/yourmodule/mix/1.0'>

[yourmodulent:yourComponent] > jnt:content, mix:title
 - textField (string) internationalized
 - richTextField (string, richtext) internationalized
 - singleFile (weakreference, picker[type='image']) < 'jmix:image'
 - multipleFiles (weakreference, picker[type='image']) multiple < 'jmix:image'
 - folderReference (weakreference, picker[type='folder'])
 - booleanField (boolean) = false
 - choiceField (string, choicelist)
```

**Key Points:**

- Use namespaced types: `yourmodulent:` for node types, `yourmodulemix:` for mixins
- `weakreference` for file/folder pickers
- `picker[type='folder']` or `picker[type='image']` for Content Editor selectors
- `< 'jmix:image'` constrains to image nodes only
- `multiple` for multi-value properties
- `internationalized` for i18n-enabled properties
- `richtext` for rich text editor fields
- `choicelist` for dropdown/radio fields (define values in JSON override)

### 2.2 Server Views (`*.server.tsx`)

Server-side React components that render on the Jahia server.

**Basic Pattern:**

```tsx
import {
  jahiaComponent,
  server,
  buildNodeUrl,
  AddResources,
  buildModuleFileUrl,
} from "@jahia/javascript-modules-library";
import type { YourComponentProps } from "./types";
import classes from "./YourComponent.module.css";

export default jahiaComponent(
  {
    componentType: "view",
    nodeType: "yourmodulent:yourComponent",
    name: "default",
    displayName: "Default View",
  },
  (props: YourComponentProps, { renderContext, currentNode }) => {
    const { "jcr:title": title, textField, fileReference } = props;

    // Component logic here

    // Example: Build URL for a file node
    if (fileReference) {
      server.render.addCacheDependency({ node: fileReference }, renderContext);
      const fileUrl = buildNodeUrl(fileReference);
    }

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <div className={classes.root}>
          {title && <h2>{title}</h2>}
          {/* Component markup */}
        </div>
      </>
    );
  },
);
```

**Key Jahia Helpers:**

- `jahiaComponent(config, renderer)` - Registers the component
- `server.render.addCacheDependency({ node }, renderContext)` - Adds cache dependencies
- `buildNodeUrl(node)` - Generates URLs for JCR file nodes
- `buildModuleFileUrl(path)` - Generates URLs for module static resources
- `AddResources` - Loads CSS/JS resources (CRITICAL - see section 4)

### 2.3 Client Islands (`*.island.client.tsx`)

Client-side interactive components that hydrate after SSR.

**Pattern:**

```tsx
import { useState } from "react";
import classes from "./Component.module.css";

interface ClientProps {
  data: any[];
}

export default function ClientComponent({ data }: ClientProps) {
  const [state, setState] = useState(0);

  // Client-only logic

  return <div className={classes.interactive}>{/* Interactive UI */}</div>;
}
```

**Usage in Server Component:**

```tsx
import { Island } from "@jahia/javascript-modules-library";
import ClientComponent from "./component.island.client";

// In server view:
<Island component={ClientComponent} props={{ data: processedData }}>
  <div>Fallback content</div>
</Island>;
```

---

## 3. Working with JCR Nodes

### 3.1 Understanding Node Objects

**CRITICAL:** In Jahia JavaScript Modules, JCR nodes are **Java objects**, not plain JavaScript objects.

**Types of Node References:**

1. **JCR Node (Java object)** - Has methods like `getPath()`, `getNodes()`, `isNodeType()`
2. **File reference object** - Has properties like `{ path: string, uuid: string }`
3. **Serialized data** - Plain objects with data already extracted

### 3.2 Rendering Child Nodes in List Components

**CRITICAL:** Use `getChildNodes` + `Render` component pattern, not `renderChildren()`.

**Reference: mdl-templatesset repository patterns (CafeteriaMenu, JcrQuery, Footer)**

```tsx
import { jahiaComponent, getChildNodes, Render } from "@jahia/javascript-modules-library";

export default jahiaComponent(
  {
    componentType: "view",
    nodeType: "yourmodulent:gallery",
    name: "default",
  },
  (props, { currentNode }) => {
    // Get all child nodes
    const childNodes = getChildNodes(currentNode, -1, 0);

    return (
      <div className={classes.gallery}>
        {childNodes.map((childNode) => (
          <Render key={childNode.getIdentifier()} node={childNode} view="gallery" />
        ))}
      </div>
    );
  },
);
```

**Key Points:**

- `getChildNodes(node, maxItems, offset)` returns array of child nodes
- Use `-1` for unlimited items
- Use `Render` component (capital R) to render each child
- `key={childNode.getIdentifier()}` for React reconciliation
- `view="gallery"` specifies which view to render
- **NEVER use `server.render.render()` directly** - use `Render` component
- **`renderChildren()` does NOT exist** - it's not available in the library

**Optional Filtering:**

```tsx
// Filter by node type
const childNodes = getChildNodes(currentNode, -1, 0, (node) => node.isNodeType("jmix:image"));
```

### 3.3 Iterating Folder Contents

**CRITICAL PATTERN - File/Folder Reference Detection:**

A file or folder property can be passed in two different ways:

1. As a JCR Node object itself (has methods like `getPath()`)
2. As a plain object with properties like `{ path: string, uuid: string }`

**Pattern that works (matches JSP behavior):**

```tsx
if (folderReference) {
  try {
    let folderNode = null;

    // CRITICAL: Check if folder IS already a JCR node
    if (folderReference.getPath && typeof folderReference.getPath === "function") {
      // Case 1: folder is already a JCR node with methods
      folderNode = folderReference;
    } else if (folderReference.path) {
      // Case 2: folder is an object with path property
      folderNode = currentNode.getSession().getNode(folderReference.path);
    }

    if (folderNode) {
      // Iterate through child nodes using NodeIterator (matches JSP pattern)
      const nodeIterator = folderNode.getNodes();
      const childNodes: any[] = [];

      while (nodeIterator.hasNext()) {
        const childNode = nodeIterator.nextNode();

        // Filter by node type as needed
        if (childNode.isNodeType("jmix:image")) {
          childNodes.push(childNode);
        }
      }

      console.log("Found " + childNodes.length + " nodes");
    }
  } catch (error) {
    console.error("Error: " + String(error));
  }
}
```

**Building URLs for File References:**

```tsx
// For JCR file nodes (has getPath method)
if (video.getPath && typeof video.getPath === "function") {
  server.render.addCacheDependency({ node: video }, renderContext);
  videoUrl = buildNodeUrl(video);
}
// For file objects (has path property)
else if (video.path) {
  videoUrl = `/files/default${video.path}`;
}
```

**JSP Equivalent Pattern:**

```jsp
<c:set var="targetFolderPath" value="${currentNode.properties.folder.node.path}"/>
<jcr:node var="targetNode" path="${targetFolderPath}"/>

<c:forEach items="${targetNode.nodes}" var="child">
    <c:if test="${jcr:isNodeType(child, 'jmix:image')}">
        <!-- Process node -->
    </c:if>
</c:forEach>
```

**Why This Matters:**

- Must check BOTH `getPath()` method AND `.path` property
- JCR nodes need `buildNodeUrl()`, objects need manual path construction
- This matches the JSP iteration pattern exactly
- Same pattern applies to ALL file/folder references (images, videos, documents)### 3.4 Building File URLs (UPDATED)

**For JCR File Nodes (has getPath method):**

```tsx
if (file.getPath && typeof file.getPath === "function") {
  // This is a JCR node - use buildNodeUrl
  server.render.addCacheDependency({ node: file }, renderContext);
  const fileUrl = buildNodeUrl(file);
}
```

**For File Reference Objects (has .path property):**

```tsx
if (file.path) {
  // This is a plain object - construct URL manually
  const fileUrl = `/files/default${file.path}`;
}
```

**Complete Pattern for File/Folder References:**

```tsx
let fileUrl = "";

if (fileReference) {
  // Check if it's a JCR node (has methods)
  if (fileReference.getPath && typeof fileReference.getPath === "function") {
    server.render.addCacheDependency({ node: fileReference }, renderContext);
    fileUrl = buildNodeUrl(fileReference);
  }
  // Check if it's a plain object (has properties)
  else if (fileReference.path) {
    fileUrl = `/files/default${fileReference.path}`;
  }
}
```

**Why Both Checks Are Needed:**

- Content created via Content Editor may pass JCR nodes directly
- Content imported or created programmatically may pass plain objects
- VideoHeading, InternalVideo, ExternalVideo all use this pattern
- ImageGallery folder reference uses this pattern
- **ALWAYS check both patterns for file/folder/image references**

### 3.5 Common JCR Methods

```typescript
// Node methods
node.getPath(); // Returns JCR path as string
node.getNodes(); // Returns NodeIterator
node.isNodeType(type); // Checks if node is of type
node.getProperty(name); // Gets property
node.getSession(); // Gets JCR session

// Session methods
session.getNode(path); // Gets node by path
session.getNodeByIdentifier(uuid); // Gets node by UUID

// Iterator methods
iterator.hasNext(); // Check if more nodes
iterator.nextNode(); // Get next node
```

---

## 4. CSS Resources & Styling

### 4.1 CSS Modules

Each component has its own CSS module file that is automatically scoped.

### 4.3 Vite Build Configuration

The CSS is compiled by Vite into a single file:

**`vite.config.mjs`**

```javascript
import { defineConfig } from "vite";
import jahia from "@jahia/vite-plugin";

export default defineConfig({
  plugins: [jahia({})],
  ssr: {
    external: ["@jahia/javascript-modules-library"],
    noExternal: ["react", "react-i18next", "i18next"],
  },
});
```

**Build Output:**

```
dist/
├── server/index.js           # All server components bundled
├── client/                   # Individual client islands
│   ├── carousel.island.client.tsx.js
│   └── VideoPlayer.island.client.tsx.js
└── assets/style.css          # ALL CSS modules compiled into one file
```

---

## 5. Localization (i18n)

### 5.1 Client-Side Translations (i18next)

**Location:** `settings/locales/*.json`

**`settings/locales/en.json`**

```json
{
  "yourModule": {
    "componentA": {
      "title": "Component Title",
      "description": "Component description",
      "noData": "No data available",
      "actions": {
        "view": "View",
        "edit": "Edit",
        "delete": "Delete"
      }
    },
    "componentB": {
      "title": "Another Component",
      "loading": "Loading..."
    }
  }
}
```

**`settings/locales/fr.json`**

```json
{
  "yourModule": {
    "componentA": {
      "title": "Titre du composant",
      "description": "Description du composant",
      "noData": "Aucune donnée disponible",
      "actions": {
        "view": "Voir",
        "edit": "Modifier",
        "delete": "Supprimer"
      }
    }
  }
}
```

**Usage in Client Component:**

```tsx
import { useTranslation } from "react-i18next";

export default function Component() {
  const { t } = useTranslation();

  return <h2>{t("mediaGallery.imageGallery.title")}</h2>;
}
```

### 5.2 Server-Side Resource Bundles

**Location:** `settings/resources/*.properties`

**`settings/resources/your-module_en.properties`**

```properties
# Node Types (displayed in Content Editor)
yourmodulent_yourComponent=Your Component
yourmodulent_anotherComponent=Another Component

# Properties (field labels in Content Editor)
yourmodulent_yourComponent.textField=Text Field
yourmodulent_yourComponent.textField.ui.tooltip=Enter text here
yourmodulent_yourComponent.fileReference=Select File
yourmodulent_yourComponent.folderReference=Select Folder
yourmodulent_yourComponent.booleanField=Enable Feature

# Choice List Options (for dropdown/radio fields)
yourmodulent_yourComponent.choiceField.option1=Option 1
yourmodulent_yourComponent.choiceField.option2=Option 2
yourmodulent_yourComponent.choiceField.option3=Option 3

# Views (displayed in view selector)
yourmodulent_yourComponent.default=Default View
yourmodulent_yourComponent.alternateView=Alternate View
yourmodulent_yourComponent.customView=Custom View
```

**`settings/resources/your-module_fr.properties`**

```properties
# Node Types
yourmodulent_yourComponent=Votre composant
yourmodulent_anotherComponent=Autre composant

# Properties
yourmodulent_yourComponent.textField=Champ de texte
yourmodulent_yourComponent.textField.ui.tooltip=Entrez le texte ici
yourmodulent_yourComponent.fileReference=Sélectionner un fichier
yourmodulent_yourComponent.folderReference=Sélectionner un dossier
yourmodulent_yourComponent.booleanField=Activer la fonctionnalité
```

**Naming Convention:**

```
{nodeType}_{propertyName}=Label
{nodeType}_{propertyName}.ui.tooltip=Tooltip text
{nodeType}_{propertyName}.{choiceValue}=Choice label for dropdowns
{nodeType}.{viewName}=View display name
```

**Note:** Node type names use underscores `_` in properties files, but colons `:` in CND files.

- CND: `yourmodulent:yourComponent`
- Properties: `yourmodulent_yourComponent`

---

## 6. Content Editor Forms (JSON Overrides)

### 6.1 Why JSON Overrides?

**Old Pattern (DEPRECATED):**

- Java `ChoiceListInitializer` classes
- Requires compilation
- Hard to maintain

**New Pattern (RECOMMENDED):**

- JSON files in `settings/content-editor-forms/`
- No code compilation needed
- Easy to version control
- Dynamic updates

### 6.2 JSON Override Structure

**Location:** `settings/content-editor-forms/fieldsets/<nodeType>.json`

**`settings/content-editor-forms/fieldsets/yourmodulent_yourComponent.json`**

```json
{
  "name": "yourmodulent:yourComponent",
  "description": "Your component configuration",
  "dynamic": false,
  "fields": [
    {
      "name": "choiceField",
      "selectorType": "Choicelist",
      "selectorOptionsMap": {
        "allowCustomEntry": "false"
      },
      "valueConstraints": [
        {
          "displayValue": "First Option",
          "value": {
            "type": "String",
            "value": "option1"
          }
        },
        {
          "displayValue": "Second Option",
          "value": {
            "type": "String",
            "value": "option2"
          }
        },
        {
          "displayValue": "Third Option",
          "value": {
            "type": "String",
            "value": "option3"
          }
        }
      ]
    }
  ]
}
```

**Key Fields:**

- `name` - Node type or mixin (**use `:` not `_` here**)
- `fields` - Array of field configurations
- `selectorType` - UI widget: `Choicelist`, `Dropdown`, `RadioButton`, `Checkbox`
- `valueConstraints` - Options for choice fields
- `displayValue` - Label shown in UI (can reference resource bundle key)
- `value.type` - Data type: `String`, `Long`, `Boolean`
- `value.value` - Actual stored value in JCR

### 6.3 Corresponding CND Definition

**`src/components/YourComponent/definition.cnd`**

```cnd
[yourmodulent:yourComponent] > jnt:content, mix:title
 - choiceField (string, choicelist)
 - textField (string) internationalized
 - fileReference (weakreference, picker[type='image']) < 'jmix:image'
 - booleanField (boolean) = false
```

**Note:** The CND defines the data structure and property types. The JSON override customizes the Content Editor UI (dropdowns, radio buttons, etc.).

### 6.4 Selector Types

**Choicelist (Dropdown):**

```json
{
  "name": "fieldName",
  "selectorType": "Choicelist",
  "valueConstraints": [
    { "displayValue": "Option 1", "value": { "type": "String", "value": "opt1" } },
    { "displayValue": "Option 2", "value": { "type": "String", "value": "opt2" } }
  ]
}
```

**Radio Buttons:**

```json
{
  "name": "fieldName",
  "selectorType": "RadioButton",
  "valueConstraints": [
    /* ... */
  ]
}
```

**Checkbox (Multiple):**

```json
{
  "name": "fieldName",
  "selectorType": "Checkbox",
  "valueConstraints": [
    /* ... */
  ]
}
```

### 6.5 Conditional Display

Show/hide fields based on other field values:

```json
{
  "name": "imagesList",
  "selectorType": "Picker",
  "displayConditions": [
    {
      "property": "imgGalleryType",
      "value": "imgFile"
    }
  ]
}
```

---

## 7. Dynamic Fieldsets

Dynamic fieldsets allow different sets of properties based on user selection.

### 7.1 Implementation Pattern

**1. Define Mixins for Each Mode:**

**`src/components/ImageGallery/definition.cnd`**

```cnd
[jsmediagallerymix:directoryLink] > jmix:dynamicFieldset mixin
 extends = jsmediagallerynt:imageGallery
 - folder (weakreference, picker[type='folder'])

[jsmediagallerymix:imagesLink] > jmix:dynamicFieldset mixin
 extends = jsmediagallerynt:imageGallery
 - imagesList (weakreference, picker[type='image']) multiple

[jsmediagallerynt:imageGallery] > jnt:content, mix:title, jsmediagallerymix:component
 - bannerText (string, richtext) internationalized
 - imgGalleryType (string)
```

**Key Points:**

- Mixins must extend `jmix:dynamicFieldset`
- Mixins must extend the base node type
- Each mixin has different properties

**2. Create JSON Override with addMixin:**

---

## 8. Build & Deploy

### 8.1 Build Commands

```bash
# Development watch mode
yarn dev

# Production build
yarn build

# Type check without building
yarn build:check

# Deploy to Jahia
yarn deploy

# Combined: build and deploy
yarn watch:callback
```

### 8.2 Build Process

1. **Vite builds:**
   - Server bundle: `dist/server/index.js`
   - Client islands: `dist/client/*.js`
   - CSS: `dist/assets/style.css`

2. **Package creation:**
   - Creates `dist/package.tgz`
   - Includes `dist/`, `settings/`, component CNDs

3. **Deployment:**
   - Uploads to Jahia instance
   - Hot reload in development mode

### 8.3 package.json Jahia Configuration

```json
{
  "jahia": {
    "name": "js-media-gallery",
    "snapshot": true,
    "module-dependencies": "default",
    "module-type": "module",
    "server": "dist/server/index.js",
    "static-resources": "/dist/client,/dist/assets,/locales,/images,/icons"
  }
}
```

**static-resources paths:**

- `/dist/client` - Client island JavaScript
- `/dist/assets` - Compiled CSS and other assets
- `/locales` - i18next JSON files (if needed client-side)

---

## 9. Troubleshooting Patterns

### 9.1 Images Not Displaying

**Symptoms:**

- Images show broken image icons
- 404 errors in browser console

**Causes & Solutions:**

1. **Missing AddResources:**

   ```tsx
   // WRONG - CSS not loaded
   return <div className={classes.root}>...</div>;

   // CORRECT
   return (
     <>
       <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
       <div className={classes.root}>...</div>
     </>
   );
   ```

2. **Wrong URL building:**

   ```tsx
   // WRONG - trying to access node methods on JCRFileNode
   const url = node.getProperty("jcr:content")...

   // CORRECT - use buildNodeUrl
   const url = buildNodeUrl(node);
   ```

3. **File reference objects:**

   ```tsx
   // WRONG - file references don't have .url
   <img src={video.url} />;

   // CORRECT - build URL from path
   const videoUrl = video?.path ? `/files/default${video.path}` : undefined;
   <img src={videoUrl} />;
   ```

### 9.2 Folder Picker Not Working

**Symptoms:**

- "No images to display" when folder is selected
- Error: "javax.jcr.RepositoryException: invalid identifier: null"

**Causes & Solutions:**

1. **Checking wrong property:**

   ```tsx
   // WRONG - folder.path might be undefined
   if (folder && folder.path) {
     const folderNode = currentNode.getSession().getNode(folder.path);
   }

   // CORRECT - handle both node and object
   if (folder) {
     let folderNode = null;
     if (folder.getPath && typeof folder.getPath === "function") {
       folderNode = folder; // Already a node
     } else if (folder.path) {
       folderNode = currentNode.getSession().getNode(folder.path);
     }
   }
   ```

2. **Using wrong helper:**

   ```tsx
   // WRONG - getChildNodes might not work with filters
   imageNodes = getChildNodes(folderNode, -1, 0, filter);

   // CORRECT - iterate manually like JSP
   const nodeIterator = folderNode.getNodes();
   while (nodeIterator.hasNext()) {
     const childNode = nodeIterator.nextNode();
     if (childNode.isNodeType("jmix:image")) {
       imageNodes.push(childNode);
     }
   }
   ```

### 9.3 Console.log Not Working

**Symptom:**

- `console.log` outputs `[object Object]`

**Cause:**

- Server-side logging doesn't serialize objects

**Solution:**

```tsx
// WRONG
console.log("Data:", { foo: "bar" });
// Output: Data: [object Object]

// CORRECT
console.log("Data: " + JSON.stringify({ foo: "bar" }));
// Output: Data: {"foo":"bar"}

// OR
console.log("Folder path: " + folder.path);
console.log("Images found: " + imageNodes.length);
```

### 9.4 TypeScript Errors

**Common errors during development are EXPECTED:**

```
Cannot find module '@jahia/javascript-modules-library'
Property 'getPath' does not exist on type...
```

**Why:**

- TypeScript types for Jahia libraries not available in dev
- These resolve at runtime in Jahia environment
- The module will build and deploy successfully

**Solution:**

- Ignore these errors during development
- Focus on runtime behavior
- Use `any` types when necessary for JCR objects

---

## 10. Best Practices

### 10.1 Component Organization

✅ **DO:**

- One folder per component with all related files
- Component-level `definition.cnd` files
- Shared mixins in `settings/definitions.cnd`
- TypeScript types in `types.ts`

❌ **DON'T:**

- Put all node types in `settings/definitions.cnd`
- Mix component logic across folders
- Use global CSS classes

### 10.2 JCR Node Handling

✅ **DO:**

```tsx
// Check if node or object
if (node.getPath && typeof node.getPath === "function") {
  // It's a node
  const path = node.getPath();
}

// Iterate nodes like JSP
const iterator = folderNode.getNodes();
while (iterator.hasNext()) {
  const child = iterator.nextNode();
}

// Use buildNodeUrl for file nodes
const url = buildNodeUrl(node);

// Add cache dependencies
server.render.addCacheDependency({ node }, renderContext);
```

❌ **DON'T:**

```tsx
// Try to access methods on all objects
node.getPath(); // Might fail

// Assume .url exists
const url = fileRef.url; // Usually undefined

// Forget cache dependencies
// Missing addCacheDependency causes cache issues
```

### 10.3 CSS & Resources

✅ **DO:**

```tsx
// Load CSS in EVERY view
<AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />

// Use CSS Modules
import classes from "./Component.module.css";
<div className={classes.root}>

// Scoped class names
.root { } // Becomes .Component_root_abc123
```

❌ **DON'T:**

```tsx
// Assume CSS loads automatically
<div className={classes.root}> // Without AddResources

// Use global classes
<div className="root"> // Not scoped

// Forget to import CSS module
const classes = {} // Won't work
```

### 10.4 Localization

✅ **DO:**

```properties
# Clear hierarchical keys
jsmediagallerynt_imageGallery.folder=Image Folder
jsmediagallerynt_imageGallery.folder.ui.tooltip=Select a folder

# Consistent naming
jsmediagallerynt_externalVideo.videoService.youtube=YouTube
```

```json
{
  "mediaGallery": {
    "imageGallery": {
      "title": "Image Gallery"
    }
  }
}
```

❌ **DON'T:**

```properties
# Inconsistent naming
folder=Image Folder
imageGalleryFolder=Image Folder

# Missing translations
# Only EN, no FR
```

### 10.5 Content Editor Forms

✅ **DO:**

```json
{
  "name": "jsmediagallerynt:externalVideo",
  "fields": [
    {
      "name": "videoService",
      "selectorType": "Choicelist",
      "valueConstraints": [
        {
          "displayValue": "YouTube",
          "value": { "type": "String", "value": "youtube" }
        }
      ]
    }
  ]
}
```

❌ **DON'T:**

```json
{
  // Missing required fields
  "fields": [
    {
      "name": "videoService"
      // Missing selectorType
      // Missing valueConstraints
    }
  ]
}
```

### 10.6 Error Handling

✅ **DO:**

```tsx
try {
  const folderNode = currentNode.getSession().getNode(folder.path);
  // Process node
} catch (error) {
  console.error("Error: " + String(error));
  // Provide fallback UI
}
```

❌ **DON'T:**

```tsx
// No error handling
const folderNode = currentNode.getSession().getNode(folder.path);
// Crashes if path is invalid
```

### 10.7 Debugging

✅ **DO:**

```tsx
// Visual debug output
<div style={{ background: "#f0f0f0", padding: "1rem" }}>
  <strong>DEBUG:</strong>
  <br />
  Has folder: {folder ? "YES" : "NO"}
  <br />
  Images found: {imageNodes.length}
</div>;

// String concatenation in logs
console.log("Found " + imageNodes.length + " images");
```

❌ **DON'T:**

```tsx
// Object logging (doesn't work server-side)
console.log("Data:", { images: imageNodes });
// Output: Data: [object Object]
```

---

## Quick Reference

### Essential Jahia Helpers

```tsx
// Import from library
import {
  jahiaComponent, // Component registration
  server, // Server utilities
  buildNodeUrl, // Build URLs for JCR nodes
  buildModuleFileUrl, // Build URLs for static resources
  AddResources, // Load CSS/JS
  Island, // Client hydration
  getChildNodes, // Get filtered children (use carefully)
} from "@jahia/javascript-modules-library";

// Usage patterns
jahiaComponent(config, renderer);
server.render.addCacheDependency({ node }, renderContext);
buildNodeUrl(node);
buildModuleFileUrl("dist/assets/style.css");
```

### File URL Patterns

```tsx
// JCR file nodes
buildNodeUrl(node)

// File reference objects
const url = file?.path ? `/files/default${file.path}` : undefined;

// Modes
/files/default/... // Edit/preview
/files/live/...    // Published
```

### Node Iteration Pattern

```tsx
const nodeIterator = parentNode.getNodes();
const results = [];
while (nodeIterator.hasNext()) {
  const node = nodeIterator.nextNode();
  if (node.isNodeType("jmix:image")) {
    results.push(node);
  }
}
```

### Required AddResources

```tsx
// In EVERY server view
<AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
```

---

## Summary

This guide documents proven patterns for Jahia JavaScript Module development:

1. **Component Structure** - Folder-based organization with component-level CNDs
2. **JCR Node Handling** - Critical patterns for node detection, iteration, and URL building
3. **CSS Loading** - AddResources required in EVERY view
4. **Localization** - Both client (JSON) and server (properties) translations
5. **JSON Overrides** - Modern Content Editor customization without Java code
6. **Dynamic Fieldsets** - Multiple property sets based on user selection
7. **Build Process** - Vite compilation and Jahia deployment
8. **Troubleshooting** - Common pitfalls and their solutions
9. **Best Practices** - Do's and don'ts from real-world experience

**Key Takeaways:**

- Always check if folder references are JCR nodes or plain objects
- Use NodeIterator pattern for iterating folder contents
- Add `AddResources` CSS loading to every server view
- Use `buildNodeUrl()` for JCR nodes, manual `/files/default/` for path objects
- Define components in their own folders with component-level CNDs
- Use JSON overrides instead of Java ChoiceListInitializers
- Add cache dependencies for all referenced nodes
- Handle errors gracefully with try/catch blocks

**Update this guide** as new patterns emerge. Share it with your team to avoid common pitfalls and maintain consistency across modules.
