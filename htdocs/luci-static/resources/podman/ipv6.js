/**
 * @module podman.ipv6
 * @description IPv6 utilities for Podman network configuration
 */
'use strict';
'require baseclass';

/**
 * IPv6 utility module for automatic ULA (Unique Local Address) generation
 * Provides helpers to derive IPv6 subnets from IPv4 networks for dual-stack configurations
 */
return baseclass.extend({
    /**
     * Derive a ULA IPv6 subnet and gateway from an IPv4 subnet
     *
     * This function generates a deterministic IPv6 ULA subnet based on the IPv4 subnet,
     * using the 3rd and 4th octets as the IPv6 subnet ID. This creates a consistent
     * mapping between IPv4 and IPv6 networks.
     *
     * @param {string} ipv4 - IPv4 subnet in CIDR notation (e.g., "192.168.20.0/24")
     * @param {string} ula_prefix - OpenWrt ULA prefix (e.g., "fd52:425:78eb::/48" or "fd52:425::/48")
     * @returns {Object} IPv6 configuration
     * @returns {string} return.ipv6subnet - Generated IPv6 subnet in CIDR notation (e.g., "fd52:425:0:1400::/64")
     * @returns {string} return.ipv6gateway - Generated IPv6 gateway address (e.g., "fd52:425:0:1400::1")
     *
     * @example
     * // With full /48 ULA prefix
     * deriveUlaFromIpv4("192.168.20.0/24", "fd52:425:78eb::/48")
     * // Returns: { ipv6subnet: "fd52:425:78eb:1400::/64", ipv6gateway: "fd52:425:78eb:1400::1" }
     *
     * @example
     * // With shorter /32 ULA prefix (will be padded)
     * deriveUlaFromIpv4("10.89.5.0/24", "fd52:425::/48")
     * // Returns: { ipv6subnet: "fd52:425:0:5905::/64", ipv6gateway: "fd52:425:0:5905::1" }
     *
     * @example
     * // Edge case with minimal prefix
     * deriveUlaFromIpv4("172.16.0.1/16", "::/48")
     * // Returns: { ipv6subnet: "0:0:0:1::/64", ipv6gateway: "0:0:0:1::1" }
     */
    deriveUlaFromIpv4: function (ipv4, ula_prefix) {

        // --- 1. Process IPv4 address ---
        // Extract address portion, ignoring CIDR prefix (e.g., "192.168.20.0")
        const ipv4Address = ipv4.split('/')[0];

        // Convert to octets: [192, 168, 20, 0]
        const octets = ipv4Address.split('.').map(Number);

        // Take the 3rd and 4th octets to use as subnet identifier
        const octet3 = octets[2]; // e.g., 20
        const octet4 = octets[3]; // e.g., 0

        // Create 16-bit subnet ID as hex string
        // Example: (20 << 8) | 0 = 5120 → "1400"
        const subnetIdHex = ((octet3 << 8) | octet4).toString(16).padStart(4, '0');

        // --- 2. Process ULA prefix ---

        // Extract the address portion, ignoring prefix length (/48, /32, etc.)
        // Examples: "fd52:425:78eb::" or "fd52:425::"
        const ulaAddress = ula_prefix.split('/')[0];

        // Split the ULA address at the "::"
        // Examples:
        //   "fd52:425:78eb::" → ["fd52:425:78eb", ""]
        //   "fd52:425::"      → ["fd52:425", ""]
        const ulaParts = ulaAddress.split('::');

        // Take the part before "::" (e.g., "fd52:425:78eb" or "fd52:425")
        let ulaBase = ulaParts[0];

        // Split into hextets: ["fd52", "425", "78eb"] or ["fd52", "425"]
        let hextets = ulaBase.split(':');

        // Handle edge case of "::/48" or "::" (empty first hextet)
        if (hextets.length === 1 && hextets[0] === "") {
            hextets = [];
        }

        // Ensure we have at least 3 hextets by padding with zeros
        // This normalizes shorter prefixes like "fd52:425::" → ["fd52", "425", "0"]
        while (hextets.length < 3) {
            hextets.push('0');
        }

        // Take the first 3 hextets as the network base
        const ulaNetworkBase = hextets.slice(0, 3).join(':');

        // --- 3. Build subnet and gateway ---

        // Append the new subnet ID (e.g., "fd52:425:0:1400::")
        const ipv6SubnetAddress = `${ulaNetworkBase}:${subnetIdHex}::`;

        return {
            ipv6subnet: `${ipv6SubnetAddress}/64`,
            ipv6gateway: `${ipv6SubnetAddress}1`,
        };
    }
});
