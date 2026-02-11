import {
  AddResources,
  Island,
  buildModuleFileUrl,
  jahiaComponent,
} from "@jahia/javascript-modules-library";
import UserProfileIsland from "./UserProfile.island.client";
import type { UserProfileComponentProps, UserProfileIslandProps } from "./types";
import classes from "./UserProfile.module.css";

const API_BASE_PATH = "/modules/efficy-service/api/v1";

export default jahiaComponent(
  {
    componentType: "view",
    nodeType: "efficycomponents:userProfile",
    name: "default",
    displayName: "User Profile",
  },
  (props: UserProfileComponentProps) => {
    const islandProps: UserProfileIslandProps = {
      title: props["jcr:title"]?.trim() || "",
      apiBasePath: API_BASE_PATH,
    };

    return (
      <>
        <AddResources type="css" resources={buildModuleFileUrl("dist/assets/style.css")} />
        <div className={classes.root}>
          <Island component={UserProfileIsland} props={islandProps} clientOnly>
            <div className={classes.loadingFallback}>...</div>
          </Island>
        </div>
      </>
    );
  },
);
