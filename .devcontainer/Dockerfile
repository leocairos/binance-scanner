# .devcontainer/Dockerfile

FROM node:22

# Define o diretório de trabalho dentro do container
WORKDIR /home/node/app

# Instala ferramentas úteis (opcional)
RUN apt-get update && apt-get install -y \
    git \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Porta padrão da aplicação
# EXPOSE 3530

CMD ["bash"]
