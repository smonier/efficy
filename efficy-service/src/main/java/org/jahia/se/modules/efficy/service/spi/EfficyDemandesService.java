package org.jahia.se.modules.efficy.service.spi;

import org.jahia.se.modules.efficy.service.model.EfficyGatewayResponse;

import java.io.IOException;

public interface EfficyDemandesService {
    EfficyGatewayResponse fetchCurrentUserPerson(String authorizationHeader,
                                                 String userEmail) throws IOException;

    EfficyGatewayResponse fetchDemandesForCurrentUser(int pageSize,
                                                      String authorizationHeader,
                                                      String userEmail) throws IOException;
}
