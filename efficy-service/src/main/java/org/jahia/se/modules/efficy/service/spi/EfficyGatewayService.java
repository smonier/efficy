package org.jahia.se.modules.efficy.service.spi;

import org.jahia.se.modules.efficy.service.model.EfficyGatewayResponse;
import org.jahia.se.modules.efficy.service.model.EfficyResourceType;

import java.io.IOException;

public interface EfficyGatewayService {
    EfficyGatewayResponse forward(EfficyResourceType resourceType,
                                  String path,
                                  String query,
                                  String method,
                                  String requestBody,
                                  String authorizationHeader,
                                  String userEmail) throws IOException;
}
