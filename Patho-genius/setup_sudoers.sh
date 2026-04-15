#!/bin/bash
echo "pathogen ALL=(root) NOPASSWD: /usr/bin/tee /proc/sys/vm/drop_caches" | sudo tee /etc/sudoers.d/drop_caches > /dev/null
sudo chmod 440 /etc/sudoers.d/drop_caches
echo "SUCCESS: sudoers rule installed"
