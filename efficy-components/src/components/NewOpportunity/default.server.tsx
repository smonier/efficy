import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
} from "@jahia/javascript-modules-library";
import NewOpportunityIsland from "./NewOpportunity.island.client";
import type { NewOpportunityComponentProps, NewOpportunityIslandProps, ServiceNode, StationNode } from "./types";

const API_BASE_PATH = "/modules/efficy-service/api/v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSiteKey(currentNode: any): string {
  try {
    const resolveSite = currentNode.getResolveSite();
    if (resolveSite) {
      return resolveSite.getName();
    }
    // Fallback: parse from path
    const path = currentNode.getPath();
    const parts = path.split("/");
    if (parts.length >= 3 && parts[1] === "sites") {
      return parts[2];
    }
  } catch (error) {
    console.error("Error getting site key:", error);
  }
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fetchJahiaNodes(currentNode: any, path: string, nodeTypes: string[]): any[] {
  try {
    const siteKey = getSiteKey(currentNode);
    const resolvedPath = path.replace("{site}", siteKey);
    
    const session = currentNode.getSession();
    const targetNode = session.getNode(resolvedPath);
    
    if (!targetNode) {
      return [];
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodes: any[] = [];
    const nodeIterator = targetNode.getNodes();
    
    while (nodeIterator.hasNext()) {
      const childNode = nodeIterator.nextNode();
      
      // Check if node matches any of the required types
      const matchesType = nodeTypes.some((type) => childNode.isNodeType(type));
      if (matchesType) {
        nodes.push(childNode);
      }
    }
    
    return nodes;
  } catch (error) {
    console.error(`Error fetching nodes from ${path}:`, error);
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildServiceTree(catalogNodes: any[]): ServiceNode[] {
  const result: ServiceNode[] = [];
  
  // For each catalog node, get its children
  catalogNodes.forEach((catalogNode) => {
    try {
      const catalog: ServiceNode = {
        id: catalogNode.getIdentifier(),
        name: catalogNode.hasProperty("jcr:title") 
          ? catalogNode.getProperty("jcr:title").getString() 
          : catalogNode.getName(),
        type: "catalog",
        children: [],
      };
      
      // Get child service cards
      const childIterator = catalogNode.getNodes();
      while (childIterator.hasNext()) {
        const childNode = childIterator.nextNode();
        if (childNode.isNodeType("gncnt:serviceCard")) {
          catalog.children?.push({
            id: childNode.getIdentifier(),
            name: childNode.hasProperty("jcr:title")
              ? childNode.getProperty("jcr:title").getString()
              : childNode.getName(),
            type: "card",
          });
        }
      }
      
      result.push(catalog);
    } catch (error) {
      console.error("Error processing catalog node:", error);
    }
  });
  
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStationList(nodes: any[]): StationNode[] {
  return nodes.map((node) => {
    try {
      return {
        id: node.getIdentifier(),
        name: node.hasProperty("jcr:title")
          ? node.getProperty("jcr:title").getString()
          : node.getName(),
      };
    } catch (error) {
      console.error("Error processing station node:", error);
      return {
        id: "",
        name: "",
      };
    }
  }).filter((station) => station.id !== "");
}

export default jahiaComponent(
  {
    componentType: "view",
    nodeType: "efficycomponents:newOpportunity",
    name: "default",
    displayName: "Nouvelle opportunite",
  },
  (props: NewOpportunityComponentProps, { currentNode }) => {
    const servicesPath = props.servicesPath || "/sites/{site}/contents/services";
    const stationsPath = props.stationsPath || "/sites/{site}/contents/stations";
    
    // Fetch service catalog nodes (parents only)
    const serviceCatalogNodes = fetchJahiaNodes(currentNode, servicesPath, ["gncnt:serviceCatalog"]);
    
    // Fetch station nodes
    const stationNodes = fetchJahiaNodes(currentNode, stationsPath, ["gncnt:stationCard"]);
    
    // Build hierarchical service tree (catalogs with their card children)
    const services = buildServiceTree(serviceCatalogNodes);
    
    // Build flat station list
    const stations = buildStationList(stationNodes);
    
    const islandProps: NewOpportunityIslandProps = {
      title: props["jcr:title"]?.trim() || "",
      apiBasePath: API_BASE_PATH,
      services,
      stations,
    };

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <Island component={NewOpportunityIsland} props={islandProps} clientOnly>
          <div>...</div>
        </Island>
      </>
    );
  },
);
