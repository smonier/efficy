import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
} from "@jahia/javascript-modules-library";
import DocumentsIsland from "./Documents.island.client";
import type { DocumentsComponentProps, DocumentsIslandProps } from "./types";
import classes from "./Documents.module.css";

const API_BASE_PATH = "/modules/efficy-service/api/v1";
const DEFAULT_PAGE_SIZE = 50;

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
    nodeType: "efficycomponents:documents",
    name: "default",
    displayName: "Documents",
  },
  (props: DocumentsComponentProps) => {
    const islandProps: DocumentsIslandProps = {
      title: props["jcr:title"]?.trim() || "",
      pageSize: toPositiveInt(props.pageSize),
      apiBasePath: API_BASE_PATH,
    };

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <Island component={DocumentsIsland} props={islandProps} clientOnly>
          <div>...</div>
        </Island>
      </>
    );
  },
);
