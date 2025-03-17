#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

int connect_to_server(const char *ip, int port) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        perror("Socket creation failed");
        return -1;
    }
    
    struct sockaddr_in server_addr;
    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(port);
    
    if (inet_pton(AF_INET, ip, &server_addr.sin_addr) <= 0) {
        perror("Invalid address");
        close(sock);
        return -1;
    }
    
    if (connect(sock, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
        perror("Connection failed");
        close(sock);
        return -1;
    }
    
    printf("Connected to %s:%d successfully\n", ip, port);
    return sock;
}

int main() {
    int in_sock = connect_to_server("127.0.0.1", 9002);
    int out_sock = connect_to_server("127.0.0.1", 9001);
    
    if (in_sock > 0) {
        printf("IN socket connected!\n");
        
        // Try sending something
        const char *msg = "Hello from IN client";
        send(in_sock, msg, strlen(msg), 0);
    }
    
    if (out_sock > 0) {
        printf("OUT socket connected!\n");
        
        // Try sending something
        const char *msg = "Hello from OUT client";
        send(out_sock, msg, strlen(msg), 0);
    }
    
    // Keep the connections open for a few seconds
    sleep(5);
    
    if (in_sock > 0) close(in_sock);
    if (out_sock > 0) close(out_sock);
    
    return 0;
}
