## Claude - Como corrigir o erro EACCES

Siga estes passos no seu terminal:

1. Crie uma pasta para os pacotes globais no seu usuário:

mkdir ~/.npm-global

2. Configure o npm para usar esse novo caminho:

npm config set prefix '~/.npm-global'

3. Abra o arquivo de configuração do seu terminal:

nano ~/.bashrc

4. Cole esta linha no final do arquivo que se abriu:

export PATH=~/.npm-global/bin:$PATH

5. Salve e saia

6. Atualize o terminal para aplicar as mudanças:

source ~/.bashrc

7. Testando a instalação

Agora tente rodar novamente o comando de instalação do Claude Code sem usar a palavra sudo:

npm install -g @anthropic-ai/claude-code
