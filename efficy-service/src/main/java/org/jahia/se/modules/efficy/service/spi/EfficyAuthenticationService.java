package org.jahia.se.modules.efficy.service.spi;

import javax.servlet.http.HttpServletRequest;

public interface EfficyAuthenticationService {
    String resolveAuthorizationHeader(HttpServletRequest request);
}
