import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
} from "@jahia/javascript-modules-library";
import KnowledgeBaseIsland from "./KnowledgeBase.island.client";
import type { KnowledgeBaseComponentProps, KnowledgeBaseIslandProps } from "./types";
import classes from "./KnowledgeBase.module.css";

const API_BASE_PATH = "/modules/efficy-service/api/v1";

export default jahiaComponent(
  {
    componentType: "view",
    nodeType: "efficycomponents:knowledgeBase",
    name: "default",
    displayName: "Knowledge Base",
  },
  (props: KnowledgeBaseComponentProps) => {
    const islandProps: KnowledgeBaseIslandProps = {
      title: props["jcr:title"]?.trim() || "",
      apiBasePath: API_BASE_PATH,
    };

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <div className={classes.root}>
          <Island component={KnowledgeBaseIsland} props={islandProps} clientOnly>
            <div className={classes.loadingFallback}>...</div>
          </Island>
        </div>
      </>
    );
  },
);
