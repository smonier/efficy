import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
} from "@jahia/javascript-modules-library";
import DemandesListIsland from "./DemandesList.island.client";
import type { DemandesListComponentProps, DemandesListIslandProps } from "./types";
import classes from "./DemandesList.module.css";

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_TITLE = "";
const API_BASE_PATH = "/modules/efficy-service/api/v1";

function toPositiveInt(value: number | string | undefined): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }

  return DEFAULT_PAGE_SIZE;
}

export default jahiaComponent(
  {
    componentType: "view",
    nodeType: "efficycomponents:demandesList",
    name: "default",
    displayName: "Demandes List",
  },
  (props: DemandesListComponentProps) => {
    const islandProps: DemandesListIslandProps = {
      title: props["jcr:title"]?.trim() || DEFAULT_TITLE,
      pageSize: toPositiveInt(props.pageSize),
      apiBasePath: API_BASE_PATH,
    };

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <div className={classes.root}>
          <Island component={DemandesListIsland} props={islandProps} clientOnly>
            <div className={classes.loadingFallback}>...</div>
          </Island>
        </div>
      </>
    );
  },
);
